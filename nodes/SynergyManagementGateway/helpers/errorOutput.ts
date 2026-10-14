import { NodeApiError, NodeOperationError, type IDataObject, type INode } from 'n8n-workflow';

/**
 * Builds the item emitted for a failed request when "Continue on Fail" is on.
 *
 * The message alone is not enough to act on: a workflow needs the API's error code to branch,
 * and — when the failure is really an approval gate (HTTP 202) — the operation id, or the handle
 * to the queued change is lost. Those fields are stamped onto the error by
 * `activeDirectoryApiRequest`.
 */
export function toErrorOutput(error: unknown): IDataObject {
	const source = (error ?? {}) as IDataObject & { message?: string };

	const output: IDataObject = {
		error: typeof source.message === 'string' ? source.message : String(error),
	};

	if (typeof source.adErrorCode === 'string') {
		output.errorCode = source.adErrorCode;
	}
	if (typeof source.adHttpCode === 'string') {
		output.httpCode = source.adHttpCode;
	}
	if (source.adApprovalRequired === true) {
		output.approvalRequired = true;
		output.httpCode = '202';
	}
	if (typeof source.adOperationId === 'string') {
		output.operationId = source.adOperationId;
	}

	return output;
}

/**
 * The error a failed item is rethrown as when "Continue on Fail" is off.
 *
 * An error that is already a NodeApiError or NodeOperationError passes through unchanged: the transport's
 * NodeApiError carries the API status, problem body and the ad* fields `toErrorOutput` reads, and wrapping
 * it again would bury all of that under a generic message. Anything else (a validation `Error` from a
 * helper, a TypeError) is wrapped with the item it failed on, so n8n shows it against the right item.
 */
export function toNodeError(node: INode, error: unknown, itemIndex?: number): NodeApiError | NodeOperationError {
	if (error instanceof NodeApiError || error instanceof NodeOperationError) {
		return error;
	}
	return new NodeOperationError(node, error as Error, itemIndex === undefined ? {} : { itemIndex });
}
