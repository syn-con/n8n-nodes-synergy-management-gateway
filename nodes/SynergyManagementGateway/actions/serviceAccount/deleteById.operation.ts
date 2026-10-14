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

// DELETE /ad/service-accounts/{id}
export const properties: INodeProperties[] = [
	{
		displayName: 'Service Account ID',
		name: 'serviceAccountId',
		type: 'string',
		default: '',
		required: true,
		description: 'The object GUID of the service account. Every service still configured to run as it will fail to authenticate, and that failure appears on the hosts running those services rather than here — check the account’s host computers and SPNs first.',
	},
];

const displayOptions = {
	show: {
		resource: ['serviceAccount'],
		operation: ['deleteById'],
	},
};

export const description = updateDisplayOptions(displayOptions, properties);

export async function execute(this: IExecuteFunctions): Promise<INodeExecutionData[]> {
	const items = this.getInputData();
	const returnData: INodeExecutionData[] = [];

	for (let i = 0; i < items.length; i++) {
		const serviceAccountId = this.getNodeParameter('serviceAccountId', i) as string;

		try {
			const response = await activeDirectoryApiRequest.call(
				this,
				'DELETE',
				apiPath`/ad/service-accounts/${serviceAccountId}`,
				undefined,
				undefined,
			);

			returnData.push({
				json: toWriteResult(response, { success: true, id: serviceAccountId, deleted: true }),
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
