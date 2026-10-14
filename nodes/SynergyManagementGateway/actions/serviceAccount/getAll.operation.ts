import {
	type IDataObject,
	type IExecuteFunctions,
	type INodeExecutionData,
	type INodeProperties,
	updateDisplayOptions,
} from 'n8n-workflow';

import { activeDirectoryApiRequest } from '../../transport/activeDirectoryApiRequest';
import { toErrorOutput, toNodeError } from '../../helpers/errorOutput';

// GET /ad/service-accounts — Get-ADServiceAccount.
export const properties: INodeProperties[] = [
	{
		displayName: 'Kind',
		name: 'kind',
		type: 'options',
		default: '',
		description: 'Which flavour to return. The two differ in a way that matters: a standalone account’s password is rotated by the single machine it is installed on and cannot be shared, whereas a group account’s is rotated by the domain controllers and retrievable by the hosts named on it.',
		options: [
			{ name: 'Both', value: '' },
			{ name: 'Group Managed (gMSA)', value: 'group' },
			{ name: 'Standalone (MSA)', value: 'standalone' },
		],
	},
	{
		displayName: 'Unusable Only',
		name: 'unusableOnly',
		type: 'boolean',
		default: false,
		description: 'Whether to return only group accounts that no host can use, because they name no password-retrieval principals. Such an account looks entirely healthy — it exists and is enabled — while every service running as it fails to authenticate, so this is the useful filter for an audit.',
	},
];

const displayOptions = {
	show: {
		resource: ['serviceAccount'],
		operation: ['getAll'],
	},
};

export const description = updateDisplayOptions(displayOptions, properties);

export async function execute(this: IExecuteFunctions): Promise<INodeExecutionData[]> {
	const items = this.getInputData();
	const returnData: INodeExecutionData[] = [];

	for (let i = 0; i < items.length; i++) {
		const kind = this.getNodeParameter('kind', i, '') as string;
		const unusableOnly = this.getNodeParameter('unusableOnly', i, false) as boolean;

		try {
			const response = (await activeDirectoryApiRequest.call(
				this,
				'GET',
				'/ad/service-accounts',
				kind ? { kind } : undefined,
				undefined,
			)) as IDataObject[] | undefined;

			const accounts = response ?? [];
			const rows = unusableOnly ? accounts.filter((a) => a['isUnusable'] === true) : accounts;

			const executionData = this.helpers.constructExecutionMetaData(
				this.helpers.returnJsonArray(rows),
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
