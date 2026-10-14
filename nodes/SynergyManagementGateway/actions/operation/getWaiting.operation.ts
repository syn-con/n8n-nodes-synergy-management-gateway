import {
	type IDataObject,
	type IExecuteFunctions,
	type INodeExecutionData,
	type INodeProperties,
	updateDisplayOptions,
} from 'n8n-workflow';

import { activeDirectoryApiRequest } from '../../transport/activeDirectoryApiRequest';

import { toErrorOutput, toNodeError } from '../../helpers/errorOutput';

// The API clamps page size to 100 (see App/Endpoints/V1/Operations/Waiting/GetWaiting.cs).
const BATCH_SIZE = 100;

export const properties: INodeProperties[] = [
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
		typeOptions: {
			minValue: 1,
		},
		displayOptions: {
			show: {
				returnAll: [false],
			},
		},
		default: 50,
		description: 'Max number of results to return',
	},
	{
		displayName: 'Search',
		name: 'search',
		type: 'string',
		default: '',
		description: 'Filter by operation name or display name',
	},
];

const displayOptions = {
	show: {
		resource: ['operation'],
		operation: ['getWaiting'],
	},
};

export const description = updateDisplayOptions(displayOptions, properties);

export async function execute(this: IExecuteFunctions): Promise<INodeExecutionData[]> {
	const items = this.getInputData();
	const returnData: INodeExecutionData[] = [];

	for (let i = 0; i < items.length; i++) {
		const returnAll = this.getNodeParameter('returnAll', i) as boolean;
		const limit = this.getNodeParameter('limit', i, 50) as number;
		const search = this.getNodeParameter('search', i, '') as string;

		const qs: IDataObject = {
			page: 1,
			limit: returnAll ? BATCH_SIZE : Math.min(limit, BATCH_SIZE),
		};

		if (search) {
			qs.search = search;
		}

		let records: IDataObject[] = [];

		try {
			while (returnAll || records.length < limit) {
				const response = (await activeDirectoryApiRequest.call(
					this,
					'GET',
					'/operations/waiting',
					qs,
					undefined,
				)) as { items: IDataObject[]; meta: { currentPage: number; totalPages: number } };

				if (!response || !response.items) {
					break;
				}

				records.push(...response.items);

				const currentPage = response.meta?.currentPage ?? (qs.page as number);
				const totalPages = response.meta?.totalPages ?? currentPage;

				if (currentPage >= totalPages || (!returnAll && records.length >= limit)) {
					break;
				}

				qs.page = currentPage + 1;
			}

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
