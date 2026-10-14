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

export const properties: INodeProperties[] = [
	{
		displayName: 'OU ID',
		name: 'ouId',
		type: 'string',
		default: '',
		required: true,
		description: 'GUID of the Organizational Unit',
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
						displayName: 'Attribute Name',
						name: 'attributeName',
						type: 'string',
						default: '',
					},
				],
			},
		],
	},
];

const displayOptions = {
	show: {
		resource: ['organizationalUnit'],
		operation: ['getById'],
	},
};

export const description = updateDisplayOptions(displayOptions, properties);

export async function execute(this: IExecuteFunctions): Promise<INodeExecutionData[]> {
	const items = this.getInputData();
	const returnData: INodeExecutionData[] = [];

	for (let i = 0; i < items.length; i++) {
		const ouId = this.getNodeParameter('ouId', i) as string;
		const propertiesRaw = (this.getNodeParameter('properties.attribute', i, []) as IDataObject[]).map(
			(attr) => attr.attributeName,
		);

		const qs: IDataObject = {};
		if (propertiesRaw.length > 0) {
			qs.properties = propertiesRaw;
		}

		try {
			const response = (await activeDirectoryApiRequest.call(
				this,
				'GET',
				apiPath`/ad/organization-units/${ouId}`,
				qs,
				undefined,
			)) as IDataObject;

			const executionData = this.helpers.constructExecutionMetaData(
				this.helpers.returnJsonArray([response]),
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
