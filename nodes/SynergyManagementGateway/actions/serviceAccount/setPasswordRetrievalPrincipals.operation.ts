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

// PUT /ad/service-accounts/{id}/password-retrieval-principals
export const properties: INodeProperties[] = [
	{
		displayName: 'Service Account ID',
		name: 'serviceAccountId',
		type: 'string',
		default: '',
		required: true,
		description: 'The object GUID of the group managed service account',
	},
	{
		displayName: 'Principal Object IDs',
		name: 'principalObjectIds',
		type: 'string',
		default: '',
		description:
			'The COMPLETE comma-separated set of object GUIDs allowed to retrieve the managed password. This HANDS OUT A CREDENTIAL rather than granting a directory permission: whoever is named can obtain the password from the KDS and authenticate as the account. A full replacement, not an addition — read the current set first and include everything to keep, or hosts that were working will stop. Leave both this and the SID field empty to revoke every host’s access, which stops the service authenticating everywhere',
	},
	{
		displayName: 'Principal SIDs',
		name: 'principalSids',
		type: 'string',
		default: '',
		description: 'Comma-separated SIDs, combined with the object GUIDs above. Required for a well-known principal that has no directory object.',
	},
];

const displayOptions = {
	show: {
		resource: ['serviceAccount'],
		operation: ['setPasswordRetrievalPrincipals'],
	},
};

export const description = updateDisplayOptions(displayOptions, properties);

function splitList(raw: string | undefined): string[] {
	return (raw ?? '')
		.split(',')
		.map((s) => s.trim())
		.filter((s) => s.length > 0);
}

export async function execute(this: IExecuteFunctions): Promise<INodeExecutionData[]> {
	const items = this.getInputData();
	const returnData: INodeExecutionData[] = [];

	for (let i = 0; i < items.length; i++) {
		const serviceAccountId = this.getNodeParameter('serviceAccountId', i) as string;
		const principalObjectIds = splitList(
			this.getNodeParameter('principalObjectIds', i, '') as string,
		);
		const principalSids = splitList(this.getNodeParameter('principalSids', i, '') as string);

		try {
			const response = await synergyManagementGatewayApiRequest.call(
				this,
				'PUT',
				apiPath`/ad/service-accounts/${serviceAccountId}/password-retrieval-principals`,
				undefined,
				{ principalObjectIds, principalSids } as IDataObject,
			);

			const total = principalObjectIds.length + principalSids.length;

			returnData.push({
				json: toWriteResult(response, {
					success: true,
					serviceAccountId,
					principalCount: total,
					// Surfaced so a workflow can branch on the destructive case rather than having to
					// recompute it from two empty arrays.
					revokedAll: total === 0,
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
