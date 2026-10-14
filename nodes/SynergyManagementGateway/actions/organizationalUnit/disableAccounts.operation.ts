import {
	type IExecuteFunctions,
	type INodeExecutionData,
	type INodeProperties,
	updateDisplayOptions,
} from 'n8n-workflow';

import { accountStateProperties, executeRun, failOnPartialFailureProperty } from './accountState.shared';

export const properties: INodeProperties[] = [...accountStateProperties, failOnPartialFailureProperty];

const displayOptions = {
	show: {
		resource: ['organizationalUnit'],
		operation: ['disableAccounts'],
	},
};

export const description = updateDisplayOptions(displayOptions, properties);

/**
 * Disables every matching account in the Organizational Unit. At most 100 accounts change in one run; a
 * larger selection is refused (OrganizationUnitAccounts.TooMany) rather than split. The item carries
 * the plan, the per-account batch results and top-level success / partialFailure / failed counters —
 * see `toRunResult`.
 */
export async function execute(this: IExecuteFunctions): Promise<INodeExecutionData[]> {
	return executeRun.call(this, 'disable');
}
