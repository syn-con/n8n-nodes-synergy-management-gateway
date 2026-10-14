import {
	type IExecuteFunctions,
	type INodeExecutionData,
	type INodeProperties,
	updateDisplayOptions,
} from 'n8n-workflow';

import { activeDirectoryApiRequest } from '../../transport/activeDirectoryApiRequest';
import { toWriteResult } from '../../helpers/writeResult';
import { apiPath } from '../../transport/apiPath';

import { toErrorOutput, toNodeError } from '../../helpers/errorOutput';

export const properties: INodeProperties[] = [
	{
		displayName: 'OU ID',
		name: 'ouId',
		type: 'string',
		default: '',
		required: true,
		description: 'GUID of the Organizational Unit to delete',
	},
];

const displayOptions = {
	show: {
		resource: ['organizationalUnit'],
		operation: ['deleteById'],
	},
};

export const description = updateDisplayOptions(displayOptions, properties);

export async function execute(this: IExecuteFunctions): Promise<INodeExecutionData[]> {
	const items = this.getInputData();
	const returnData: INodeExecutionData[] = [];

	for (let i = 0; i < items.length; i++) {
		const ouId = this.getNodeParameter('ouId', i) as string;

		try {
			const response = await activeDirectoryApiRequest.call(this, 'DELETE', apiPath`/ad/organization-units/${ouId}`, undefined, undefined);

			returnData.push({
				json: toWriteResult(response, { success: true, id: ouId }),
				pairedItem: { item: i },
			});
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
