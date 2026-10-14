import type { IDataObject } from 'n8n-workflow';

import { isApprovalPending } from '../transport/approvalPending';

/**
 * Builds the item a write operation emits from what the transport returned.
 *
 * With "On Approval Required = Continue", a gated write does not throw: the transport returns the
 * approval-pending item (approvalRequired=true, operationId, ...) in place of the API's response.
 * The change has NOT been made — it is queued for a person to decide. So that item must flow on as
 * it is, never wrapped into `{ success: true, ... }`, or a workflow treats a queued delete or disable
 * as done and never routes it to "Operation → Wait for Approval".
 *
 * Every write operation emits through this one function; `test/writeOperations.test.ts` runs each
 * of them against a 202 and fails for one that does not.
 *
 * @param response what `synergyManagementGatewayApiRequest` resolved to
 * @param fallback the item to emit when the change was actually carried out
 */
export function toWriteResult(response: unknown, fallback: IDataObject): IDataObject {
	if (isApprovalPending(response)) {
		return { ...response };
	}
	return fallback;
}
