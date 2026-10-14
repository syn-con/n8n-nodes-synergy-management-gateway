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

// PUT /ad/computers/{id}/service-accounts — Add-/Remove-ADComputerServiceAccount.
export const properties: INodeProperties[] = [
	{
		displayName: 'Computer ID',
		name: 'computerId',
		type: 'string',
		default: '',
		required: true,
		description: 'The object GUID of the computer',
	},
	{
		displayName: 'Service Account ID',
		name: 'serviceAccountId',
		type: 'string',
		default: '',
		required: true,
		description: 'The object GUID of the standalone managed service account',
	},
	{
		displayName: 'Linked',
		name: 'linked',
		type: 'boolean',
		default: true,
		description: 'Whether to link the account to the computer. Linking alone does not make the account usable there — Install-ADServiceAccount has to be run on the machine as well, and that is a local operation this API cannot perform.',
	},
];

const displayOptions = {
	show: {
		resource: ['serviceAccount'],
		operation: ['setComputerLink'],
	},
};

export const description = updateDisplayOptions(displayOptions, properties);

export async function execute(this: IExecuteFunctions): Promise<INodeExecutionData[]> {
	const items = this.getInputData();
	const returnData: INodeExecutionData[] = [];

	for (let i = 0; i < items.length; i++) {
		const computerId = this.getNodeParameter('computerId', i) as string;
		const serviceAccountId = this.getNodeParameter('serviceAccountId', i) as string;
		const linked = this.getNodeParameter('linked', i, true) as boolean;

		try {
			const response = await activeDirectoryApiRequest.call(
				this,
				'PUT',
				apiPath`/ad/computers/${computerId}/service-accounts`,
				undefined,
				{ serviceAccountId, linked } as IDataObject,
			);

			returnData.push({
				json: toWriteResult(response, { success: true, computerId, serviceAccountId, linked }),
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
