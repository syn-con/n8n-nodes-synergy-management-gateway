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
		displayName: 'Current Password',
		name: 'oldPassword',
		type: 'string',
		typeOptions: {
			password: true,
		},
		default: '',
		required: true,
		description: "The user's current password",
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
		description:
			'The replacement password. Must differ from the current one, and is enforced against password history and minimum password age — unlike Reset Password, which bypasses both.',
	},
];

const displayOptions = {
	show: {
		resource: ['user'],
		operation: ['changePassword'],
	},
};

export const description = updateDisplayOptions(displayOptions, properties);

export async function execute(this: IExecuteFunctions): Promise<INodeExecutionData[]> {
	const items = this.getInputData();
	const returnData: INodeExecutionData[] = [];

	for (let i = 0; i < items.length; i++) {
		const userId = this.getNodeParameter('userId', i) as string;
		const oldPassword = this.getNodeParameter('oldPassword', i) as string;
		const newPassword = this.getNodeParameter('newPassword', i) as string;

		try {
			const response = await activeDirectoryApiRequest.call(
				this,
				'POST',
				apiPath`/ad/users/${userId}/change-password`,
				undefined,
				{
					oldPassword,
					newPassword,
				},
			);

			// Neither password is echoed into the output item: workflow data is persisted with the
			// execution and visible to anyone who can open it.
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
