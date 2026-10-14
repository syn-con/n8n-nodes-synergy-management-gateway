import {
	type IDataObject,
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
		displayName: 'User ID',
		name: 'userId',
		type: 'string',
		default: '',
		required: true,
		description: 'The object GUID of the AD user to unlock',
	},
];

const displayOptions = {
	show: {
		resource: ['user'],
		operation: ['unlock'],
	},
};

export const description = updateDisplayOptions(displayOptions, properties);

export async function execute(this: IExecuteFunctions): Promise<INodeExecutionData[]> {
	const items = this.getInputData();
	const returnData: INodeExecutionData[] = [];

	for (let i = 0; i < items.length; i++) {
		const userId = this.getNodeParameter('userId', i) as string;

		try {
			// The API returns { userId, wasLocked }. wasLocked is forwarded rather than swallowed so a
			// workflow can branch on it: the operation is idempotent, so success alone does not mean the
			// account had actually been locked.
			const response = (await activeDirectoryApiRequest.call(
				this,
				'POST',
				apiPath`/ad/users/${userId}/unlock`,
				undefined,
				undefined,
			)) as IDataObject | undefined;

			returnData.push({
				json: toWriteResult(response, {
					success: true,
					id: userId,
					wasLocked: response?.['wasLocked'] ?? null,
				}),
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
