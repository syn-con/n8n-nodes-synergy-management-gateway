import {
	type IDataObject,
	type IExecuteFunctions,
	type INodeExecutionData,
	type INodeProperties,
	updateDisplayOptions,
} from 'n8n-workflow';

import { synergyManagementGatewayApiRequest } from '../../transport/synergyManagementGatewayApiRequest';
import { toWriteResult } from '../../helpers/writeResult';
import { apiPath } from '../../transport/apiPath';
import { toErrorOutput, toNodeError } from '../../helpers/errorOutput';

// PATCH /ad/service-accounts/{id} — Set-ADServiceAccount.
export const properties: INodeProperties[] = [
	{
		displayName: 'Service Account ID',
		name: 'serviceAccountId',
		type: 'string',
		default: '',
		required: true,
		description: 'The object GUID of the service account',
	},
	{
		displayName: 'Update Fields',
		name: 'updateFields',
		type: 'collection',
		placeholder: 'Add Field',
		default: {},
		description: 'Only the fields you add are changed. The rotation interval is absent on purpose — Active Directory fixes it at creation and ignores later writes — and the password-retrieval principals have their own operation because changing them hands out a credential.',
		options: [
			{
				displayName: 'Description',
				name: 'description',
				type: 'string',
				default: '',
				description: 'Free-text description. Empty string clears it.',
			},
			{
				displayName: 'DNS Host Name',
				name: 'dnsHostName',
				type: 'string',
				default: '',
				description: 'DNS host name. Empty string clears it.',
			},
			{
				displayName: 'Enabled',
				name: 'enabled',
				type: 'boolean',
				default: true,
				description: 'Whether the account is enabled',
			},
			{
				displayName: 'Service Principal Names',
				name: 'servicePrincipalNames',
				type: 'string',
				default: '',
				description: 'The COMPLETE comma-separated set, replacing the current one. Leave empty to remove every SPN.',
			},
		],
	},
];

const displayOptions = {
	show: {
		resource: ['serviceAccount'],
		operation: ['update'],
	},
};

export const description = updateDisplayOptions(displayOptions, properties);

export async function execute(this: IExecuteFunctions): Promise<INodeExecutionData[]> {
	const items = this.getInputData();
	const returnData: INodeExecutionData[] = [];

	for (let i = 0; i < items.length; i++) {
		const serviceAccountId = this.getNodeParameter('serviceAccountId', i) as string;
		const fields = this.getNodeParameter('updateFields', i, {}) as IDataObject;

		const body: IDataObject = {};

		// Presence, not truthiness: an empty string is the documented way to clear a field, so a truthiness
		// test would silently drop the clear.
		if (fields['description'] !== undefined) body['description'] = fields['description'];
		if (fields['dnsHostName'] !== undefined) body['dnsHostName'] = fields['dnsHostName'];
		if (fields['enabled'] !== undefined) body['enabled'] = fields['enabled'];

		if (fields['servicePrincipalNames'] !== undefined) {
			body['servicePrincipalNames'] = String(fields['servicePrincipalNames'])
				.split(',')
				.map((s) => s.trim())
				.filter((s) => s.length > 0);
		}

		try {
			const response = (await synergyManagementGatewayApiRequest.call(
				this,
				'PATCH',
				apiPath`/ad/service-accounts/${serviceAccountId}`,
				undefined,
				body,
			)) as IDataObject | undefined;

			returnData.push({ json: toWriteResult(response, { success: true, ...response }), pairedItem: { item: i } });
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
