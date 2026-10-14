import {
	type IDataObject,
	type IExecuteFunctions,
	type INodeExecutionData,
	type INodeProperties,
	NodeOperationError,
} from 'n8n-workflow';

import { synergyManagementGatewayApiRequest } from '../../transport/synergyManagementGatewayApiRequest';
import { isApprovalPending } from '../../transport/approvalPending';
import { apiPath } from '../../transport/apiPath';
import { toErrorOutput, toNodeError } from '../../helpers/errorOutput';

/**
 * Shared parameters and behaviour of the OU-wide account operations: Preview Account Enable/Disable,
 * Enable Accounts and Disable Accounts.
 *
 * The server resolves which accounts beneath the OU would change (the "plan") and, for a run, re-sends
 * one enable/disable command per account through its own pipeline. That makes a run a batch: it is not
 * transactional, and the API answers 207 Multi-Status when some accounts changed and others failed. The
 * transport passes a 207 through as an ordinary body, so this module is where it is read — see
 * `toRunResult`.
 */

export const accountStateProperties: INodeProperties[] = [
	{
		displayName: 'OU ID',
		name: 'ouId',
		type: 'string',
		default: '',
		required: true,
		description: 'GUID of the Organizational Unit whose accounts are changed',
	},
	{
		displayName: 'Account Kinds',
		name: 'accountKinds',
		type: 'options',
		default: 'users',
		description: 'Which kind of account in the Organizational Unit is affected',
		options: [
			{ name: 'Users', value: 'users', description: 'User accounts only' },
			{ name: 'Computers', value: 'computers', description: 'Computer accounts only' },
			{ name: 'All', value: 'all', description: 'User and computer accounts' },
		],
	},
	{
		displayName: 'Scope',
		name: 'accountScope',
		type: 'options',
		default: 'oneLevel',
		description: 'Whether accounts in nested Organizational Units are included',
		options: [
			{
				name: 'Only This OU',
				value: 'oneLevel',
				description: 'Accounts directly inside this Organizational Unit',
			},
			{
				name: 'Include Sub-OUs',
				value: 'subtree',
				description: 'Accounts in this Organizational Unit and every Organizational Unit beneath it',
			},
		],
	},
];

/** The 207-handling option, offered on the two run operations only. */
export const failOnPartialFailureProperty: INodeProperties = {
	displayName: 'Fail on Partial Failure',
	name: 'failOnPartialFailure',
	type: 'boolean',
	default: false,
	description:
		'Whether to fail the item when some accounts could not be changed. Accounts changed before the failure stay changed either way — the run is not transactional. When off, the item is emitted with success=false and the failed count.',
};

function readSelection(context: IExecuteFunctions, i: number) {
	return {
		ouId: context.getNodeParameter('ouId', i) as string,
		kinds: context.getNodeParameter('accountKinds', i, 'users') as string,
		scope: context.getNodeParameter('accountScope', i, 'oneLevel') as string,
	};
}

/**
 * Builds the item for a run from the API's `{ plan, batch? }` body.
 *
 * The body is emitted whole, with the batch counters lifted to the top so a workflow can branch on
 * them without digging: `success` is true only when no account failed, and `partialFailure` marks a
 * 207. A 207 is therefore neither an error (some accounts did change) nor a success — reading it as
 * either would hide what happened. `batch` is absent when nothing needed changing, which is a success
 * with zero counts.
 *
 * An approval-pending item (On Approval Required = Continue) flows on unchanged and carries no
 * `success`: nothing has been changed yet.
 */
export function toRunResult(response: unknown): IDataObject {
	if (isApprovalPending(response)) {
		return { ...response };
	}

	const body = (response ?? {}) as IDataObject;
	const batch = (body.batch ?? null) as IDataObject | null;

	const total = typeof batch?.total === 'number' ? batch.total : 0;
	const succeeded = typeof batch?.succeeded === 'number' ? batch.succeeded : 0;
	const failed = typeof batch?.failed === 'number' ? batch.failed : 0;

	return {
		...body,
		success: failed === 0,
		partialFailure: failed > 0,
		total,
		succeeded,
		failed,
	};
}

/** Preview: GET the plan of what an enable or disable would change. Never writes. */
export async function executePreview(this: IExecuteFunctions): Promise<INodeExecutionData[]> {
	const items = this.getInputData();
	const returnData: INodeExecutionData[] = [];

	for (let i = 0; i < items.length; i++) {
		const { ouId, kinds, scope } = readSelection(this, i);
		const action = this.getNodeParameter('planAction', i, 'disable') as string;

		try {
			const response = (await synergyManagementGatewayApiRequest.call(
				this,
				'GET',
				apiPath`/ad/organization-units/${ouId}/accounts/plan`,
				{ action, kinds, scope },
				undefined,
			)) as IDataObject;

			returnData.push({ json: response ?? {}, pairedItem: { item: i } });
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

/** Run: POST enable or disable for every account the plan would change. */
export async function executeRun(
	this: IExecuteFunctions,
	action: 'enable' | 'disable',
): Promise<INodeExecutionData[]> {
	const items = this.getInputData();
	const returnData: INodeExecutionData[] = [];

	for (let i = 0; i < items.length; i++) {
		const { ouId, kinds, scope } = readSelection(this, i);
		const failOnPartialFailure = this.getNodeParameter('failOnPartialFailure', i, false) as boolean;

		try {
			const path =
				action === 'enable'
					? apiPath`/ad/organization-units/${ouId}/accounts/enable`
					: apiPath`/ad/organization-units/${ouId}/accounts/disable`;

			const response = await synergyManagementGatewayApiRequest.call(this, 'POST', path, undefined, {
				kinds,
				scope,
			});

			const result = toRunResult(response);

			if (failOnPartialFailure && result.partialFailure === true) {
				throw new NodeOperationError(
					this.getNode(),
					`${result.failed} of ${result.total} accounts could not be changed`,
					{
						itemIndex: i,
						description:
							'Every account that did not fail was still changed — the run is not transactional. Turn off "Fail on Partial Failure" to receive the per-account results as an item.',
					},
				);
			}

			returnData.push({ json: result, pairedItem: { item: i } });
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
