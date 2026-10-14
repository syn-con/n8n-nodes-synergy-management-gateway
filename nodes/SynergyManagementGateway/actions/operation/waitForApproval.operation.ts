import {
	NodeOperationError,
	type IDataObject,
	type IExecuteFunctions,
	type INodeExecutionData,
	type INodeProperties,
	sleep,
	updateDisplayOptions,
} from 'n8n-workflow';

import { synergyManagementGatewayApiRequest } from '../../transport/synergyManagementGatewayApiRequest';
import { apiPath } from '../../transport/apiPath';
import { WAITING_TO_APPROVE } from '../../transport/approvalPending';

import { toErrorOutput, toNodeError } from '../../helpers/errorOutput';

/** Statuses that end the wait. Anything else means the decision is still outstanding. */
const DECIDED_STATUSES = ['Success', 'Failed', 'Rejected', 'Cancelled'];

/**
 * Reported in place of the server's status for a request whose approval window has closed.
 *
 * The server never moves an expired request out of WaitingToApprove — it is only marked Failed if somebody
 * tries to approve it afterwards — while approvers stop seeing it the moment it expires. So once
 * `expiresAt` has passed, nobody can decide it any more and "still waiting" would be a wrong answer: the
 * workflow needs to know to resubmit.
 */
export const EXPIRED_STATUS = 'Expired';

const MIN_POLL_INTERVAL_SECONDS = 5;

/**
 * The longest this node will ever wait, whatever the timeout says. A wait has no use past the request's
 * own expiry (72 hours by default); this only bounds a request that names no expiry or a typed timeout.
 */
export const MAX_WAIT_SECONDS = 7 * 24 * 60 * 60;

/**
 * How long past `expiresAt` the node keeps polling before calling the request expired. The deadline is the
 * server's; this absorbs a clock on the n8n host that runs ahead of it, so an approval made in the last
 * seconds of the window is not reported as an expiry.
 */
export const EXPIRY_GRACE_SECONDS = 60;

export const properties: INodeProperties[] = [
	{
		displayName: 'Operation ID',
		name: 'operationId',
		type: 'string',
		default: '={{ $json.operationId }}',
		required: true,
		description:
			'The ID (GUID) of the queued operation to wait on. Defaults to the operation ID emitted by an approval-gated write operation.',
	},
	{
		displayName: 'Poll Interval (Seconds)',
		name: 'pollInterval',
		type: 'number',
		typeOptions: {
			minValue: MIN_POLL_INTERVAL_SECONDS,
		},
		default: 30,
		description: 'How long to wait between status checks',
	},
	{
		displayName: 'Timeout (Seconds)',
		name: 'timeout',
		type: 'number',
		typeOptions: {
			minValue: 0,
			maxValue: MAX_WAIT_SECONDS,
		},
		default: 3600,
		description:
			'Give up after this long and fail the item. Set to 0 to wait until the approval request expires. Never more than 7 days (604800 seconds).',
	},
	{
		displayName: 'Fail on Rejection',
		name: 'failOnRejection',
		type: 'boolean',
		default: true,
		description:
			'Whether to fail the item when the operation is rejected, expires undecided, or its execution fails. Turn off to emit the outcome and let the workflow decide.',
	},
];

const displayOptions = {
	show: {
		resource: ['operation'],
		operation: ['waitForApproval'],
	},
};

export const description = updateDisplayOptions(displayOptions, properties);

/**
 * The request's expiry in epoch milliseconds, or undefined when it names none (or an unreadable one).
 * A timestamp with no zone designator is read as UTC, which is what the server stores.
 */
function expiryOf(operation: IDataObject | undefined): number | undefined {
	const raw = operation?.expiresAt;
	if (typeof raw !== 'string' || raw.trim() === '') {
		return undefined;
	}
	const text = /(Z|[+-]\d{2}:?\d{2})$/i.test(raw.trim()) ? raw.trim() : `${raw.trim()}Z`;
	const ms = Date.parse(text);
	return Number.isNaN(ms) ? undefined : ms;
}

export async function execute(this: IExecuteFunctions): Promise<INodeExecutionData[]> {
	const items = this.getInputData();
	const returnData: INodeExecutionData[] = [];

	for (let i = 0; i < items.length; i++) {
		const operationId = this.getNodeParameter('operationId', i) as string;
		const pollInterval = Math.max(
			MIN_POLL_INTERVAL_SECONDS,
			Number(this.getNodeParameter('pollInterval', i, 30)) || MIN_POLL_INTERVAL_SECONDS,
		);
		const requestedTimeout = Math.max(0, Number(this.getNodeParameter('timeout', i, 3600)) || 0);
		const failOnRejection = this.getNodeParameter('failOnRejection', i, true) as boolean;

		try {
			if (!operationId) {
				throw new NodeOperationError(
					this.getNode(),
					'No operation ID to wait on. Set the node option "On Approval Required" to "Continue and Output Operation ID" on the write operation feeding this node.',
					{ itemIndex: i },
				);
			}

			// 0 means "until the request expires", which the expiry check below enforces; the hard maximum
			// bounds that and any typed timeout alike. Computed once so a slow API cannot stretch the wait.
			const timeout =
				requestedTimeout > 0 ? Math.min(requestedTimeout, MAX_WAIT_SECONDS) : MAX_WAIT_SECONDS;
			const deadline = Date.now() + timeout * 1000;
			let operation: IDataObject | undefined;
			let expired = false;

			// Poll-first: the decision may already be in by the time this node runs.
			for (;;) {
				operation = (await synergyManagementGatewayApiRequest.call(
					this,
					'GET',
					apiPath`/operations/${operationId}`,
					undefined,
					undefined,
				)) as IDataObject;

				const status = typeof operation?.status === 'string' ? operation.status : '';
				if (status !== WAITING_TO_APPROVE) {
					break;
				}

				const now = Date.now();
				const expiresAt = expiryOf(operation);
				const expiryCutoff =
					expiresAt === undefined ? undefined : expiresAt + EXPIRY_GRACE_SECONDS * 1000;
				if (expiryCutoff !== undefined && now >= expiryCutoff) {
					expired = true;
					break;
				}

				const remaining = deadline - now;
				if (remaining <= 0) {
					const why =
						requestedTimeout > 0
							? `Timed out after ${timeout}s`
							: `Gave up after the maximum wait of ${MAX_WAIT_SECONDS}s`;
					throw new NodeOperationError(
						this.getNode(),
						`${why} waiting for a decision on operation ${operationId}, which is still ${WAITING_TO_APPROVE}.`,
						{ itemIndex: i },
					);
				}

				// Never sleep past the deadline or the expiry — either would overshoot the answer.
				const untilExpiry = expiryCutoff === undefined ? Number.POSITIVE_INFINITY : expiryCutoff - now;
				await sleep(Math.max(0, Math.min(pollInterval * 1000, remaining, untilExpiry)));
			}

			const status = expired
				? EXPIRED_STATUS
				: typeof operation?.status === 'string'
					? operation.status
					: 'Unknown';
			const approved = status === 'Success';

			if (!approved && failOnRejection) {
				const reason = expired
					? `the approval request expired at ${String(operation?.expiresAt)} without a decision; submit the change again to queue a new request`
					: (typeof operation?.resultMessage === 'string' && operation.resultMessage) ||
						(typeof operation?.errorMessage === 'string' && operation.errorMessage) ||
						`the operation ended as ${status}`;
				throw new NodeOperationError(
					this.getNode(),
					`Operation ${operationId} was not carried out: ${reason}`,
					{ itemIndex: i },
				);
			}

			const executionData = this.helpers.constructExecutionMetaData(
				this.helpers.returnJsonArray([
					{
						...operation,
						status,
						approved,
						decided: expired || DECIDED_STATUSES.includes(status),
						expired,
					},
				]),
				{ itemData: { item: i } },
			);
			returnData.push(...executionData);
		} catch (error) {
			if (this.continueOnFail()) {
				returnData.push({ json: toErrorOutput(error), pairedItem: { item: i } });
				continue;
			}
			throw toNodeError(this.getNode(), error, i);
		}
	}

	return returnData;
}
