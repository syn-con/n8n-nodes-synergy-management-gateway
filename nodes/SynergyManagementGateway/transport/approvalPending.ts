import type { IDataObject, INodeProperties } from 'n8n-workflow';

/**
 * An Active Directory command whose operation policy requires approval is not executed inline.
 * The API persists it as an operation in `WaitingToApprove` and answers `202 Accepted` with the
 * operation id (see `OperationAcceptedDto` on the backend), instead of carrying out the change.
 *
 * This module holds the shared vocabulary for that outcome: how to recognise it on a response,
 * how it is shaped when emitted as a workflow item, and the node option that decides whether the
 * node fails or continues when it happens.
 */

/** Discriminator the API puts on the 202 body. */
export const APPROVAL_REQUIRED_CODE = 'Operation.ApprovalRequired';

/** Status an operation carries while it is still awaiting a decision. */
export const WAITING_TO_APPROVE = 'WaitingToApprove';

/** What the node should do when the API answers 202 instead of performing the change. */
export type OnApprovalRequired = 'error' | 'continue';

/** The 202 body, normalised for use as a workflow item. */
export interface ApprovalPendingItem extends IDataObject {
	/** Always true — lets a downstream IF node branch on the outcome. */
	approvalRequired: true;
	/** Handle to poll with the "Operation → Wait for Approval" (or "Get by ID") operation. */
	operationId: string;
	code: string;
	status: string;
	message: string;
	displayName?: string;
	expiresAt?: string;
	pollUrl?: string;
}

/**
 * Recognises the approval-gated response. Returns the normalised item, or null when the response
 * is an ordinary success that should flow through untouched.
 */
export function parseApprovalPending(
	statusCode: number | undefined,
	body: unknown,
): ApprovalPendingItem | null {
	if (statusCode !== 202) {
		return null;
	}

	const payload = (body ?? {}) as IDataObject;
	const operationId = payload.operationId;

	// A 202 without an operation id is not something a caller can poll on; treat it as a plain
	// response rather than inventing a handle.
	if (typeof operationId !== 'string' || operationId.length === 0) {
		return null;
	}

	return {
		approvalRequired: true,
		operationId,
		code: typeof payload.code === 'string' ? payload.code : APPROVAL_REQUIRED_CODE,
		status: typeof payload.status === 'string' ? payload.status : WAITING_TO_APPROVE,
		message:
			typeof payload.message === 'string'
				? payload.message
				: 'The operation requires approval before it is carried out.',
		displayName: typeof payload.displayName === 'string' ? payload.displayName : undefined,
		expiresAt: typeof payload.expiresAt === 'string' ? payload.expiresAt : undefined,
		pollUrl: typeof payload.pollUrl === 'string' ? payload.pollUrl : undefined,
	};
}

/** Narrows an operation's response to the approval-pending shape. */
export function isApprovalPending(value: unknown): value is ApprovalPendingItem {
	return (
		typeof value === 'object' &&
		value !== null &&
		(value as ApprovalPendingItem).approvalRequired === true &&
		typeof (value as ApprovalPendingItem).operationId === 'string'
	);
}

/**
 * Node-level options. Kept here so the option that governs approval handling lives next to the
 * code that reads it.
 */
export const nodeOptionsProperties: INodeProperties[] = [
	{
		displayName: 'Options',
		name: 'options',
		type: 'collection',
		placeholder: 'Add option',
		default: {},
		displayOptions: {
			// Reading operations are never approval-gated, so the option would only be noise there.
			hide: {
				resource: ['operation'],
			},
		},
		options: [
			{
				displayName: 'On Approval Required',
				name: 'onApprovalRequired',
				type: 'options',
				default: 'error',
				description:
					'What to do when the operation policy requires approval, so the API queues the change instead of applying it',
				options: [
					{
						name: 'Error',
						value: 'error',
						description: 'Fail the item. The error carries the operation ID so it can still be polled.',
					},
					{
						name: 'Continue and Output Operation ID',
						value: 'continue',
						description: 'Emit an item with approvalRequired=true and the operation ID, to branch on or feed into "Operation → Wait for Approval"',
					},
				],
			},
		],
	},
];
