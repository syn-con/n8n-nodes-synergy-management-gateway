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

// GET /ad/objects/{id}/acl. The AD PowerShell module ships no ACL cmdlet; the Windows equivalent is
// Get-Acl over the AD: PSDrive.
export const properties: INodeProperties[] = [
	{
		displayName: 'Object ID',
		name: 'objectId',
		type: 'string',
		default: '',
		required: true,
		description: 'The object GUID of any AD object whose access control list should be read',
	},
	{
		displayName: 'Explicit Entries Only',
		name: 'explicitOnly',
		type: 'boolean',
		default: false,
		description: 'Whether to return only the entries set directly on the object. Inherited entries cannot be changed here — they have to be changed on the container that defines them — so filtering them out is usually what an audit workflow wants.',
	},
];

const displayOptions = {
	show: {
		resource: ['security'],
		operation: ['getAcl'],
	},
};

export const description = updateDisplayOptions(displayOptions, properties);

export async function execute(this: IExecuteFunctions): Promise<INodeExecutionData[]> {
	const items = this.getInputData();
	const returnData: INodeExecutionData[] = [];

	for (let i = 0; i < items.length; i++) {
		const objectId = this.getNodeParameter('objectId', i) as string;
		const explicitOnly = this.getNodeParameter('explicitOnly', i, false) as boolean;

		try {
			const response = (await synergyManagementGatewayApiRequest.call(
				this,
				'GET',
				apiPath`/ad/objects/${objectId}/acl`,
				undefined,
				undefined,
			)) as IDataObject | undefined;

			// The filtering is applied here rather than by asking the API for less: the endpoint returns
			// both sets plus the credential-exposure summary, and the summary would be wrong if inherited
			// entries were dropped server-side.
			const entries = (response?.['accessControlEntries'] as IDataObject[] | undefined) ?? [];
			const filtered = explicitOnly ? entries.filter((e) => e['isInherited'] !== true) : entries;

			returnData.push({
				json: {
					...response,
					accessControlEntries: filtered,
				},
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
