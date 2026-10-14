import {
	type IDataObject,
	type IExecuteFunctions,
	type INodeExecutionData,
	type INodeProperties,
	updateDisplayOptions,
} from 'n8n-workflow';

import { activeDirectoryApiRequest } from '../../transport/activeDirectoryApiRequest';
import { apiPath } from '../../transport/apiPath';
import { toErrorOutput, toNodeError } from '../../helpers/errorOutput';

// GET /ad/service-accounts/{id}/password-retrieval-principals
export const properties: INodeProperties[] = [
	{
		displayName: 'Service Account ID',
		name: 'serviceAccountId',
		type: 'string',
		default: '',
		required: true,
		description:
			'The object GUID of the group managed service account. The result is the account real access list: whoever appears can obtain its password from the KDS and authenticate as it. Always empty for a standalone account, which has no such attribute',
	},
];

const displayOptions = {
	show: {
		resource: ['serviceAccount'],
		operation: ['getPasswordRetrievalPrincipals'],
	},
};

export const description = updateDisplayOptions(displayOptions, properties);

export async function execute(this: IExecuteFunctions): Promise<INodeExecutionData[]> {
	const items = this.getInputData();
	const returnData: INodeExecutionData[] = [];

	for (let i = 0; i < items.length; i++) {
		const serviceAccountId = this.getNodeParameter('serviceAccountId', i) as string;

		try {
			const response = (await activeDirectoryApiRequest.call(
				this,
				'GET',
				apiPath`/ad/service-accounts/${serviceAccountId}/password-retrieval-principals`,
				undefined,
				undefined,
			)) as IDataObject | IDataObject[] | undefined;

			// Normalised rather than assumed to be an array: an account with none legitimately yields an
			// empty body, and assuming the collection shape would crash the node instead of returning
			// nothing.
			const rows =
				response === undefined || response === null
					? []
					: Array.isArray(response)
						? response
						: [response];

			const executionData = this.helpers.constructExecutionMetaData(
				this.helpers.returnJsonArray(rows),
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
