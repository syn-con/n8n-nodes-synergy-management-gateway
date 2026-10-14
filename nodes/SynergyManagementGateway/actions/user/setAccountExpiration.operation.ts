import {
	type IExecuteFunctions,
	type INodeExecutionData,
	type INodeProperties,
	updateDisplayOptions,
} from 'n8n-workflow';

import { synergyManagementGatewayApiRequest } from '../../transport/synergyManagementGatewayApiRequest';
import { apiPath } from '../../transport/apiPath';
import { toWriteResult } from '../../helpers/writeResult';
import { toErrorOutput, toNodeError } from '../../helpers/errorOutput';

export const properties: INodeProperties[] = [
	{
		displayName: 'User ID',
		name: 'userId',
		type: 'string',
		default: '',
		required: true,
		description: 'The object GUID of the AD user',
	},
	{
		displayName: 'Action',
		name: 'expirationAction',
		type: 'options',
		default: 'set',
		options: [
			{ name: 'Set Expiry Date', value: 'set', description: 'Expire the account on a given date' },
			{
				name: 'Clear Expiry',
				value: 'clear',
				description: 'Remove the expiry so the account never expires',
			},
		],
	},
	{
		displayName: 'Expires At',
		name: 'expiresAt',
		type: 'dateTime',
		default: '',
		required: true,
		displayOptions: { show: { expirationAction: ['set'] } },
		description:
			'When the account should expire. Must fall between 1601-01-01 and 9999-12-31 UTC, the range a Windows FILETIME can represent.',
	},
];

const displayOptions = {
	show: {
		resource: ['user'],
		operation: ['setAccountExpiration'],
	},
};

export const description = updateDisplayOptions(displayOptions, properties);

export async function execute(this: IExecuteFunctions): Promise<INodeExecutionData[]> {
	const items = this.getInputData();
	const returnData: INodeExecutionData[] = [];

	for (let i = 0; i < items.length; i++) {
		const userId = this.getNodeParameter('userId', i) as string;
		const action = this.getNodeParameter('expirationAction', i, 'set') as string;

		try {
			let response: unknown;
			if (action === 'clear') {
				// DELETE clears the expiry. The PUT route accepts a null expiresAt to the same effect, but
				// DELETE states the intent in the method and needs no body.
				response = await synergyManagementGatewayApiRequest.call(
					this,
					'DELETE',
					apiPath`/ad/users/${userId}/account-expiration`,
					undefined,
					undefined,
				);
			} else {
				const expiresAt = this.getNodeParameter('expiresAt', i) as string;

				// qs is the third argument, body the fourth — pass undefined for the one not used.
				response = await synergyManagementGatewayApiRequest.call(
					this,
					'PUT',
					apiPath`/ad/users/${userId}/account-expiration`,
					undefined,
					{ expiresAt },
				);
			}

			returnData.push({
				json: toWriteResult(response, { success: true, id: userId, cleared: action === 'clear' }),
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
