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
		displayName: 'Group ID',
		name: 'groupId',
		type: 'string',
		default: '',
		required: true,
		description: 'GUID of the group',
	},
	{
		displayName: 'Member ID',
		name: 'memberId',
		type: 'string',
		default: '',
		required: true,
		description: 'GUID of the member object to remove',
	},
];

const displayOptions = {
	show: {
		resource: ['group'],
		operation: ['unassignMember'],
	},
};

export const description = updateDisplayOptions(displayOptions, properties);

export async function execute(this: IExecuteFunctions): Promise<INodeExecutionData[]> {
	const items = this.getInputData();
	const returnData: INodeExecutionData[] = [];

	for (let i = 0; i < items.length; i++) {
		const groupId = this.getNodeParameter('groupId', i) as string;
		const memberId = this.getNodeParameter('memberId', i) as string;

		try {
			const response = await synergyManagementGatewayApiRequest.call(
				this,
				'DELETE',
				apiPath`/ad/groups/${groupId}/members/${memberId}`,
				undefined,
				undefined,
			);

			returnData.push({
				json: toWriteResult(response, { success: true, groupId, memberId }),
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
