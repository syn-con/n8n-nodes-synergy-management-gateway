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
		displayName: 'Group ID',
		name: 'groupId',
		type: 'string',
		default: '',
		required: true,
		description: 'GUID of the group whose members to retrieve',
	},
	{
		displayName: 'Recursive',
		name: 'recursive',
		type: 'boolean',
		default: false,
		description:
			'Whether to follow group nesting. When enabled the result is the leaf principals only, since nested groups are traversed rather than listed. Leave disabled when you need the nested groups themselves.',
	},
];

const displayOptions = {
	show: {
		resource: ['group'],
		operation: ['getMembers'],
	},
};

export const description = updateDisplayOptions(displayOptions, properties);

export async function execute(this: IExecuteFunctions): Promise<INodeExecutionData[]> {
	const items = this.getInputData();
	const returnData: INodeExecutionData[] = [];

	for (let i = 0; i < items.length; i++) {
		const groupId = this.getNodeParameter('groupId', i) as string;
		const recursive = this.getNodeParameter('recursive', i, false) as boolean;

		try {
			// qs is the third argument (query string before body); omitted entirely when not recursive
			// so the API default governs.
			const response = (await activeDirectoryApiRequest.call(
				this,
				'GET',
				apiPath`/ad/groups/${groupId}/members`,
				recursive ? { recursive: true } : undefined,
				undefined,
			)) as IDataObject[] | undefined;

			// An empty group answers 204 with no body, which is a valid result rather than an error.
			const executionData = this.helpers.constructExecutionMetaData(
				this.helpers.returnJsonArray(response ?? []),
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
