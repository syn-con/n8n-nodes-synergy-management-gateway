import {
	type IDataObject,
	type IExecuteFunctions,
	type INodeExecutionData,
	type INodeProperties,
	updateDisplayOptions,
} from 'n8n-workflow';

import { activeDirectoryApiRequest } from '../../transport/activeDirectoryApiRequest';
import { apiPath, routeSegment } from '../../transport/apiPath';
import { toErrorOutput, toNodeError } from '../../helpers/errorOutput';

// GET /ad/{users|computers}/{id}/spns
export const properties: INodeProperties[] = [
	{
		displayName: 'Object Class',
		name: 'objectClass',
		type: 'options',
		default: 'user',
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
];

const displayOptions = {
	show: {
		resource: ['security'],
		operation: ['getSpns'],
	},
};

export const description = updateDisplayOptions(displayOptions, properties);

export async function execute(this: IExecuteFunctions): Promise<INodeExecutionData[]> {
	const items = this.getInputData();
	const returnData: INodeExecutionData[] = [];

	for (let i = 0; i < items.length; i++) {
		const objectClass = this.getNodeParameter('objectClass', i) as string;
		const objectId = this.getNodeParameter('objectId', i) as string;
		const segment = objectClass === 'computer' ? 'computers' : 'users';

		try {
			const response = (await activeDirectoryApiRequest.call(
				this,
				'GET',
				apiPath`/ad/${routeSegment(segment)}/${objectId}/spns`,
				undefined,
				undefined,
			)) as string[] | undefined;

			const spns = response ?? [];

			// isKerberoastable is derived rather than left to the workflow author to infer: any account with
			// an SPN can have a Kerberos service ticket requested for it by any domain user and the hash
			// cracked offline, which is the point of reading this list in an audit workflow.
			returnData.push({
				json: {
					objectId,
					objectClass,
					servicePrincipalNames: spns,
					isKerberoastable: spns.length > 0,
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
