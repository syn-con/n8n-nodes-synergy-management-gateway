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

const BATCH_SIZE = 100;

const OBJECT_TYPE_MAP: Record<number, string | null> = {
	0: null, // All
	1: 'user',
	2: 'group',
	3: 'computer',
	4: 'organizationalUnit',
};

export const properties: INodeProperties[] = [
	{
		displayName: 'Saved Filter Name or ID',
		name: 'savedFilterId',
		type: 'options',
		typeOptions: {
			loadOptionsMethod: 'getSavedLdapFiltersOptions',
		},
		default: '',
		required: true,
		description: 'Select a saved LDAP filter to run. Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
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
		operation: ['runSavedSearch'],
	},
};

export const description = updateDisplayOptions(displayOptions, properties);

export async function execute(this: IExecuteFunctions): Promise<INodeExecutionData[]> {
	const items = this.getInputData();
	const returnData: INodeExecutionData[] = [];

	for (let i = 0; i < items.length; i++) {
		const savedFilterId = this.getNodeParameter('savedFilterId', i) as string;
		const returnAll = this.getNodeParameter('returnAll', i) as boolean;
		const limit = this.getNodeParameter('limit', i, 50) as number;

		try {
			// 1. Fetch the saved filter configuration
			const filter = (await synergyManagementGatewayApiRequest.call(
				this,
				'GET',
				apiPath`/saved-ldap-filters/${savedFilterId}`,
				undefined,
				undefined,
			)) as IDataObject;

			// 2. Map objectType enum to class string
			const objectTypeEnum = filter.objectType as number;
			const objectClass = OBJECT_TYPE_MAP[objectTypeEnum];

			// 3. Choose the search strategy. GET /ad/objects requires an explicit `class`,
			//    so an "All" filter (objectClass === null) or one without a baseDn cannot use
			//    the client-side path — fall back to the server-side results endpoint, which
			//    resolves the saved filter (including "All") on the server.
			const useServerSide = !objectClass || !filter.baseDn;
			const endpoint = useServerSide
				? apiPath`/saved-ldap-filters/${savedFilterId}/results`
				: '/ad/objects';

			const qs: IDataObject = {
				pageSize: returnAll ? BATCH_SIZE : Math.min(limit, BATCH_SIZE),
			};

			if (!useServerSide) {
				qs.ldapFilter = filter.ldapFilter;
				qs.baseDn = filter.baseDn;
				qs.sortBy = filter.sortBy;
				qs.class = objectClass;

				if (filter.propertiesToLoad && Array.isArray(filter.propertiesToLoad)) {
					qs.properties = filter.propertiesToLoad;
				}
			}

			// 4. Execute paginated search
			let records: IDataObject[] = [];

			while (returnAll || records.length < limit) {
				const response = (await synergyManagementGatewayApiRequest.call(
					this,
					'GET',
					endpoint,
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

			// 5. Trim to limit if not returnAll
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
