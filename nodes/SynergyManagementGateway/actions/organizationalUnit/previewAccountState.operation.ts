import {
	type IExecuteFunctions,
	type INodeExecutionData,
	type INodeProperties,
	updateDisplayOptions,
} from 'n8n-workflow';

import { accountStateProperties, executePreview } from './accountState.shared';

export const properties: INodeProperties[] = [
	{
		displayName: 'Action',
		name: 'planAction',
		type: 'options',
		default: 'disable',
		description: 'Which change to preview',
		options: [
			{ name: 'Disable', value: 'disable', description: 'Preview disabling the accounts' },
			{ name: 'Enable', value: 'enable', description: 'Preview enabling the accounts' },
		],
	},
	...accountStateProperties,
];

const displayOptions = {
	show: {
		resource: ['organizationalUnit'],
		operation: ['previewAccountState'],
	},
};

export const description = updateDisplayOptions(displayOptions, properties);

/**
 * Lists what Enable Accounts / Disable Accounts would change, without changing anything: the accounts
 * to change, those already in the requested state, those excluded (with a reason) and whether the
 * selection exceeds the 100-account limit of a single run.
 */
export async function execute(this: IExecuteFunctions): Promise<INodeExecutionData[]> {
	return executePreview.call(this);
}
