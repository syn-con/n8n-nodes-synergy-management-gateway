import {
	type IDataObject,
	type IExecuteFunctions,
	type INodeExecutionData,
	type INodeProperties,
	updateDisplayOptions,
} from 'n8n-workflow';

import { activeDirectoryApiRequest } from '../../transport/activeDirectoryApiRequest';
import { apiPath } from '../../transport/apiPath';

import { toErrorOutput, toNodeError } from '../../helpers/errorOutput';

export const properties: INodeProperties[] = [
	{
		displayName: 'User ID',
		name: 'userId',
		type: 'string',
		default: '',
		required: true,
		description: 'GUID of the user',
	},
	{
		displayName: 'Recursive',
		name: 'recursive',
		type: 'boolean',
		default: false,
		description:
			'Whether to follow group nesting and return every group the user effectively belongs to. The domain controller resolves the whole chain in one query. Neither mode includes the primary group, normally Domain Users.',
	},
];

const displayOptions = {
	show: {
		resource: ['user'],
		operation: ['getGroups'],
	},
};

export const description = updateDisplayOptions(displayOptions, properties);

export async function execute(this: IExecuteFunctions): Promise<INodeExecutionData[]> {
	const items = this.getInputData();
	const returnData: INodeExecutionData[] = [];
	for (let i = 0; i < items.length; i++) {
		const userId = this.getNodeParameter('userId', i) as string;
		const recursive = this.getNodeParameter('recursive', i, false) as boolean;

		try {

			// qs is the third argument (query string before body); omitted entirely when not recursive
			// so the API default governs.
			const response = (await activeDirectoryApiRequest.call(
				this,
				'GET',
				apiPath`/ad/users/${userId}/groups`,
				recursive ? { recursive: true } : undefined,
				undefined,
			)) as IDataObject[];

			const executionData = this.helpers.constructExecutionMetaData(
				this.helpers.returnJsonArray(response),
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
