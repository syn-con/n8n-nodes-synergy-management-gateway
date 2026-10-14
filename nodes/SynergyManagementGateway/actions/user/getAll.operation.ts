import {
	type IDataObject,
	type IExecuteFunctions,
	type INodeExecutionData,
	type INodeProperties,
	updateDisplayOptions,
} from 'n8n-workflow';

import { synergyManagementGatewayApiRequest } from '../../transport/synergyManagementGatewayApiRequest';

import { toErrorOutput, toNodeError } from '../../helpers/errorOutput';

const BATCH_SIZE = 100;

export const properties: INodeProperties[] = [
	{
		displayName: 'Base DN',
		name: 'baseDn',
		type: 'string',
		default: '',
		required: true,
		description: 'The Distinguished Name of the container to search from (required by the API)',
	},
	{
		displayName: 'LDAP Filter',
		name: 'ldapFilter',
		type: 'string',
		default: '',
		description: 'Raw LDAP filter to apply',
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
		displayName: 'Properties',
		name: 'properties',
		type: 'fixedCollection',
		typeOptions: {
			multipleValues: true,
		},
		default: {},
		options: [
			{
				name: 'attribute',
				displayName: 'Attribute',
				values: [
					{
						displayName: 'Attribute Name or ID',
						name: 'attributeName',
						type: 'options',
						description: 'Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>',
						typeOptions: {
							loadOptionsMethod: "getUserSchemaAttributesOptions",

						},
						default: '',
					},
				],
			},
		],
	},
];

const displayOptions = {
	show: {
		resource: ['user'],
		operation: ['getAll'],
	},
};

export const description = updateDisplayOptions(displayOptions, properties);

export async function execute(this: IExecuteFunctions): Promise<INodeExecutionData[]> {
	const items = this.getInputData();
	const returnData: INodeExecutionData[] = [];

	for (let i = 0; i < items.length; i++) {
		const baseDn = this.getNodeParameter('baseDn', i) as string;
		const ldapFilter = this.getNodeParameter('ldapFilter', i) as string;
		const returnAll = this.getNodeParameter('returnAll', i) as boolean;
		const limit = this.getNodeParameter('limit', i ,100) as number;
		const propertiesRaw = (this.getNodeParameter('properties.attribute', i, []) as IDataObject[]).map(
			(attr) => attr.attributeName,
		);

		const qs: IDataObject = {
			baseDn,
			ldapFilter,
			pageSize: returnAll ? BATCH_SIZE : Math.min(limit, BATCH_SIZE),
		};

		if (propertiesRaw.length > 0) {
			qs.properties = propertiesRaw;
		}

		let records: IDataObject[] = [];

		try {
			while (returnAll || records.length < limit) {
				const response = (await synergyManagementGatewayApiRequest.call(
					this,
					'GET',
					'/ad/users',
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
