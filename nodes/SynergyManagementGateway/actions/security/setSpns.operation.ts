import {
	type IDataObject,
	type IExecuteFunctions,
	type INodeExecutionData,
	type INodeProperties,
	updateDisplayOptions,
} from 'n8n-workflow';

import { synergyManagementGatewayApiRequest } from '../../transport/synergyManagementGatewayApiRequest';
import { toWriteResult } from '../../helpers/writeResult';
import { apiPath, routeSegment } from '../../transport/apiPath';
import { toErrorOutput, toNodeError } from '../../helpers/errorOutput';

// PUT /ad/{users|computers}/{id}/spns — a full replacement, because an SPN must be unique forest-wide.
export const properties: INodeProperties[] = [
	{
		displayName: 'Object Class',
		name: 'objectClass',
		type: 'options',
		default: 'computer',
		description: 'Whether the target is a user or a computer',
		options: [
			{ name: 'Computer', value: 'computer' },
			{ name: 'User', value: 'user' },
		],
	},
	{
		displayName: 'Object ID',
		name: 'objectId',
		type: 'string',
		default: '',
		required: true,
		description: 'The object GUID of the user or computer',
	},
	{
		displayName: 'Service Principal Names',
		name: 'servicePrincipalNames',
		type: 'string',
		default: '',
		description:
			'The COMPLETE intended set, comma-separated — for example HTTP/web01.example.com, MSSQLSvc/db01.example.com:1433. This replaces whatever is currently set rather than adding to it, so read the current list first and include everything to keep. Leave empty to remove every SPN, which stops any Kerberos service relying on them from authenticating. Writing an SPN makes the account a Kerberos service target: any domain user can then request a ticket for it and attempt an offline crack of its password, so prefer a managed service account whose password AD rotates',
	},
];

const displayOptions = {
	show: {
		resource: ['security'],
		operation: ['setSpns'],
	},
};

export const description = updateDisplayOptions(displayOptions, properties);

export async function execute(this: IExecuteFunctions): Promise<INodeExecutionData[]> {
	const items = this.getInputData();
	const returnData: INodeExecutionData[] = [];

	for (let i = 0; i < items.length; i++) {
		const objectClass = this.getNodeParameter('objectClass', i) as string;
		const objectId = this.getNodeParameter('objectId', i) as string;
		const raw = this.getNodeParameter('servicePrincipalNames', i, '') as string;
		const segment = objectClass === 'computer' ? 'computers' : 'users';

		// Split and trim here rather than sending the raw string: an expression that produced
		// "HTTP/a, HTTP/b" would otherwise be written as one malformed SPN, which AD stores without
		// complaint and then never matches a Kerberos ticket request.
		const spns = raw
			.split(',')
			.map((s) => s.trim())
			.filter((s) => s.length > 0);

		try {
			const response = await synergyManagementGatewayApiRequest.call(
				this,
				'PUT',
				apiPath`/ad/${routeSegment(segment)}/${objectId}/spns`,
				undefined,
				{ servicePrincipalNames: spns } as IDataObject,
			);

			returnData.push({
				json: toWriteResult(response, {
					success: true,
					objectId,
					objectClass,
					servicePrincipalNames: spns,
					removedAll: spns.length === 0,
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
