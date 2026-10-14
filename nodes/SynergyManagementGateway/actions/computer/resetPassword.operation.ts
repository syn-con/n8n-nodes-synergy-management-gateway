import {
	type IExecuteFunctions,
	type INodeExecutionData,
	type INodeProperties,
	updateDisplayOptions,
} from 'n8n-workflow';

import { synergyManagementGatewayApiRequest } from '../../transport/synergyManagementGatewayApiRequest';
import { toWriteResult } from '../../helpers/writeResult';
import { apiPath } from '../../transport/apiPath';

import { toErrorOutput, toNodeError } from '../../helpers/errorOutput';

export const properties: INodeProperties[] = [
	{
		displayName: 'Computer ID',
		name: 'computerId',
		type: 'string',
		default: '',
		required: true,
	},
	{
		displayName: 'New Password',
		name: 'newPassword',
		type: 'string',
		typeOptions: {
			password: true,
		},
		default: '',
		required: true,
	},
];

const displayOptions = {
	show: {
		resource: ['computer'],
		operation: ['resetPassword'],
	},
};

export const description = updateDisplayOptions(displayOptions, properties);

export async function execute(this: IExecuteFunctions): Promise<INodeExecutionData[]> {
	const items = this.getInputData();
	const returnData: INodeExecutionData[] = [];

	for (let i = 0; i < items.length; i++) {
		const computerId = this.getNodeParameter('computerId', i) as string;
		const newPassword = this.getNodeParameter('newPassword', i) as string;

		try {
			const response = await synergyManagementGatewayApiRequest.call(this, 'POST', apiPath`/ad/computers/${computerId}/reset-password`, undefined, {
				newPassword,
			});

			returnData.push({
				json: toWriteResult(response, { success: true, id: computerId }),
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
