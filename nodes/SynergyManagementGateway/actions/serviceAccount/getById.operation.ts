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

// GET /ad/service-accounts/{id}
export const properties: INodeProperties[] = [
	{
		displayName: 'Service Account ID',
		name: 'serviceAccountId',
		type: 'string',
		default: '',
		required: true,
		description: 'The object GUID of the service account',
	},
];

const displayOptions = {
	show: {
		resource: ['serviceAccount'],
		operation: ['getById'],
	},
};

export const description = updateDisplayOptions(displayOptions, properties);

export async function execute(this: IExecuteFunctions): Promise<INodeExecutionData[]> {
	const items = this.getInputData();
	const returnData: INodeExecutionData[] = [];

	for (let i = 0; i < items.length; i++) {
		const serviceAccountId = this.getNodeParameter('serviceAccountId', i) as string;

		try {
			const response = (await activeDirectoryApiRequest.call(
				this,
				'GET',
				apiPath`/ad/service-accounts/${serviceAccountId}`,
				undefined,
				undefined,
			)) as IDataObject | undefined;

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
