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

// GET /ad/computers/{id}/service-accounts — Get-ADComputerServiceAccount.
export const properties: INodeProperties[] = [
	{
		displayName: 'Computer ID',
		name: 'computerId',
		type: 'string',
		default: '',
		required: true,
		description: 'The object GUID of the computer. The link records which machine a standalone account is intended for; actually using it also needs Install-ADServiceAccount run on that machine, which stores the credential locally and cannot be done over LDAP.',
	},
];

const displayOptions = {
	show: {
		resource: ['serviceAccount'],
		operation: ['getComputerServiceAccounts'],
	},
};

export const description = updateDisplayOptions(displayOptions, properties);

export async function execute(this: IExecuteFunctions): Promise<INodeExecutionData[]> {
	const items = this.getInputData();
	const returnData: INodeExecutionData[] = [];

	for (let i = 0; i < items.length; i++) {
		const computerId = this.getNodeParameter('computerId', i) as string;

		try {
			const response = (await synergyManagementGatewayApiRequest.call(
				this,
				'GET',
				apiPath`/ad/computers/${computerId}/service-accounts`,
				undefined,
				undefined,
			)) as string[] | undefined;

			returnData.push({
				json: {
					computerId,
					serviceAccounts: response ?? [],
				} as IDataObject,
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
