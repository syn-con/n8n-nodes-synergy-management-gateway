import {
	type IExecuteFunctions,
	type INodeExecutionData,
	type INodeProperties,
	NodeOperationError,
	updateDisplayOptions,
} from 'n8n-workflow';

import { activeDirectoryApiRequest } from '../../transport/activeDirectoryApiRequest';
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
		displayName: 'Array Property',
		name: 'arrayProperty',
		type: 'string',
		default: 'members',
		required: true,
		description: 'Property name in input JSON containing the array of items',
		placeholder: 'members',
	},
	{
		displayName: 'ID Key',
		name: 'idKey',
		type: 'string',
		default: 'id',
		required: true,
		description: 'Property name within each array item containing the ID',
		placeholder: 'ID',
	},
];

const displayOptions = {
	show: {
		resource: ['group'],
		operation: ['assignMembers'],
	},
};

export const description = updateDisplayOptions(displayOptions, properties);

export async function execute(this: IExecuteFunctions): Promise<INodeExecutionData[]> {
	const items = this.getInputData();
	const returnData: INodeExecutionData[] = [];

	for (let i = 0; i < items.length; i++) {
		const groupId = this.getNodeParameter('groupId', i) as string;
		const arrayProperty = this.getNodeParameter('arrayProperty', i) as string;
		const idKey = this.getNodeParameter('idKey', i) as string;

		try {
			const inputData = items[i].json;
			const rawArray = inputData[arrayProperty];

			if (!Array.isArray(rawArray)) {
				throw new NodeOperationError(
					this.getNode(),
					`Property '${arrayProperty}' is not an array or does not exist`,
					{ itemIndex: i },
				);
			}

			const members = (rawArray as Array<Record<string, unknown>>).map((item) => ({ id: item[idKey] }));

			const response = await activeDirectoryApiRequest.call(
				this,
				'POST',
				apiPath`/ad/groups/${groupId}/members/batch`,
				undefined,
				{ members },
			);

			returnData.push({
				json: toWriteResult(response, { success: true, groupId, membersCount: members.length }),
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
