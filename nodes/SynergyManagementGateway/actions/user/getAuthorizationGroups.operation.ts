import {
	type IDataObject,
	type IExecuteFunctions,
	type INodeExecutionData,
	type INodeProperties,
	updateDisplayOptions,
} from 'n8n-workflow';

import { synergyManagementGatewayApiRequest } from '../../transport/synergyManagementGatewayApiRequest';
import { apiPath } from '../../transport/apiPath';

import { toErrorOutput, toNodeError } from '../../helpers/errorOutput';

export const properties: INodeProperties[] = [
	{
		displayName: 'Account ID',
		name: 'accountId',
		type: 'string',
		default: '',
		required: true,
		description:
			'GUID of the account. Any account class works — a user, a computer or a managed service account.',
	},
];

const displayOptions = {
	show: {
		resource: ['user'],
		operation: ['getAuthorizationGroups'],
	},
};

export const description = updateDisplayOptions(displayOptions, properties);

export async function execute(this: IExecuteFunctions): Promise<INodeExecutionData[]> {
	const items = this.getInputData();
	const returnData: INodeExecutionData[] = [];

	for (let i = 0; i < items.length; i++) {
		const accountId = this.getNodeParameter('accountId', i) as string;

		try {
			// 204 when the token carries no groups, which the transport surfaces as an empty body.
			// Normalising to an array here keeps a downstream node from having to special-case it.
			const response = (await synergyManagementGatewayApiRequest.call(
				this,
				'GET',
				apiPath`/ad/users/${accountId}/authorization-groups`,
				undefined,
				undefined,
			)) as IDataObject[] | undefined;

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
