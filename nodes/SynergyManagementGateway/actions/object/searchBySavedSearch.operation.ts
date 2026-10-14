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

const BATCH_SIZE = 100;

export const properties: INodeProperties[] = [
	{
		displayName: 'Saved Search Name or ID',
		name: 'savedSearchId',
		type: 'options',
		typeOptions: {
			loadOptionsMethod: 'getSavedLdapFiltersOptions',
		},
		default: '',
		required: true,
		description:
			'Select a saved search to execute server-side. Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
	},
	{
		displayName: 'Return All',
		name: 'returnAll',
		type: 'boolean',
		default: false,
		description: 'Whether to return all results or only up to a given limit',
	},
	{
		displayName: 'Limit',
		name: 'limit',
		type: 'number',
		displayOptions: {
			show: {
				returnAll: [false],
			},
		},
		typeOptions: {
			minValue: 1,
		},
		default: 50,
		description: 'Max number of results to return',
	},
];

const displayOptions = {
	show: {
		resource: ['object'],
		operation: ['searchBySavedSearch'],
	},
};

export const description = updateDisplayOptions(displayOptions, properties);

export async function execute(this: IExecuteFunctions): Promise<INodeExecutionData[]> {
	const items = this.getInputData();
	const returnData: INodeExecutionData[] = [];

	for (let i = 0; i < items.length; i++) {
		const savedSearchId = this.getNodeParameter('savedSearchId', i) as string;
		const returnAll = this.getNodeParameter('returnAll', i) as boolean;
		const limit = this.getNodeParameter('limit', i, 50) as number;

		try {
			// The server resolves the saved filter and executes the LDAP search in one call.
			const qs: IDataObject = {
				pageSize: returnAll ? BATCH_SIZE : Math.min(limit, BATCH_SIZE),
			};

			let records: IDataObject[] = [];

			while (returnAll || records.length < limit) {
				const response = (await activeDirectoryApiRequest.call(
					this,
					'GET',
					apiPath`/saved-ldap-filters/${savedSearchId}/results`,
					qs,
					undefined,
				)) as { data: IDataObject[]; meta: { hasNextPage: boolean; nextContinuationToken: string } };

				if (!response || !response.data) {
					break;
				}

				records.push(...response.data);

				if (!response.meta.hasNextPage || (!returnAll && records.length >= limit)) {
					break;
				}

				qs.continuationToken = response.meta.nextContinuationToken;
			}

			// Trim to limit if not returning all
			if (!returnAll && records.length > limit) {
				records = records.slice(0, limit);
			}

			const executionData = this.helpers.constructExecutionMetaData(
				this.helpers.returnJsonArray(records),
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
