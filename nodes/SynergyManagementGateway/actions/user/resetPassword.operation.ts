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
	{
		displayName: 'Must Change Password At Logon',
		name: 'mustChangePasswordAtLogon',
		type: 'boolean',
		default: false,
	},
];

const displayOptions = {
	show: {
		resource: ['user'],
		operation: ['resetPassword'],
	},
};

export const description = updateDisplayOptions(displayOptions, properties);

export async function execute(this: IExecuteFunctions): Promise<INodeExecutionData[]> {
	const items = this.getInputData();
	const returnData: INodeExecutionData[] = [];

	for (let i = 0; i < items.length; i++) {
		const userId = this.getNodeParameter('userId', i) as string;
		const newPassword = this.getNodeParameter('newPassword', i) as string;
		const mustChangePasswordAtLogon = this.getNodeParameter('mustChangePasswordAtLogon', i) as boolean;

		try {
			const response = await synergyManagementGatewayApiRequest.call(this, 'POST', apiPath`/ad/users/${userId}/reset-password`, undefined, {
				newPassword,
				mustChangePasswordAtLogon,
			});

			returnData.push({
				json: toWriteResult(response, { success: true, id: userId }),
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
