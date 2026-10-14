import {
	type IDataObject,
	type IExecuteFunctions,
	type INodeExecutionData,
	type INodeProperties,
	updateDisplayOptions,
} from 'n8n-workflow';

import { activeDirectoryApiRequest } from '../../transport/activeDirectoryApiRequest';
import { toWriteResult } from '../../helpers/writeResult';
import { apiPath } from '../../transport/apiPath';
import { toErrorOutput, toNodeError } from '../../helpers/errorOutput';

// PUT /ad/organization-units/{id}/protect-from-deletion — the ProtectedFromAccidentalDeletion property of
// Set-ADOrganizationalUnit. It reads like an attribute but writes a deny of Delete and Delete Subtree to
// Everyone, which is why it lives on this resource rather than the organizational-unit one.
export const properties: INodeProperties[] = [
	{
		displayName: 'Organizational Unit ID',
		name: 'objectId',
		type: 'string',
		default: '',
		required: true,
		description: 'The object GUID of the organizational unit',
	},
	{
		displayName: 'Protect',
		name: 'protect',
		type: 'boolean',
		default: true,
		description:
			'Whether to protect the OU from deletion. Turning protection OFF makes a tree deletion possible: Delete Subtree removes the OU and every user, group, computer and nested OU beneath it in one operation. Check whether the AD Recycle Bin is enabled first — Get Many Optional Features on the Directory Context resource reports it — because without it those objects are not recoverable through the directory',
	},
];

const displayOptions = {
	show: {
		resource: ['security'],
		operation: ['setDeletionProtection'],
	},
};

export const description = updateDisplayOptions(displayOptions, properties);

export async function execute(this: IExecuteFunctions): Promise<INodeExecutionData[]> {
	const items = this.getInputData();
	const returnData: INodeExecutionData[] = [];

	for (let i = 0; i < items.length; i++) {
		const objectId = this.getNodeParameter('objectId', i) as string;
		const protect = this.getNodeParameter('protect', i) as boolean;

		try {
			const response = (await activeDirectoryApiRequest.call(
				this,
				'PUT',
				apiPath`/ad/organization-units/${objectId}/protect-from-deletion`,
				undefined,
				{ protect },
			)) as IDataObject | undefined;

			returnData.push({
				json: toWriteResult(response, {
					success: true,
					objectId,
					protectedFromDeletion: protect,
					...response,
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
