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
		displayName: 'User ID',
		name: 'userId',
		type: 'string',
		default: '',
		required: true,
		description: 'GUID of the user',
	},
	{
		displayName: 'Group ID',
		name: 'groupId',
		type: 'string',
		default: '',
		required: true,
		description: 'GUID of the group to assign the user to',
	},
];

const displayOptions = {
	show: {
		resource: ['user'],
		operation: ['assignGroup'],
	},
};

export const description = updateDisplayOptions(displayOptions, properties);

export async function execute(this: IExecuteFunctions): Promise<INodeExecutionData[]> {
	const items = this.getInputData();
	const returnData: INodeExecutionData[] = [];

	for (let i = 0; i < items.length; i++) {
		const userId = this.getNodeParameter('userId', i) as string;
		const groupId = this.getNodeParameter('groupId', i) as string;

		try {
			const response = await synergyManagementGatewayApiRequest.call(
				this,
				'POST',
				apiPath`/ad/users/${userId}/groups`,
				undefined,
				{ groupId },
			);

			returnData.push({
				json: toWriteResult(response, { success: true, userId, groupId }),
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
