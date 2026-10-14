import {
	type IDataObject,
	type IExecuteFunctions,
	type INodeExecutionData,
	type INodeProperties,
	updateDisplayOptions,
} from 'n8n-workflow';

import { synergyManagementGatewayApiRequest } from '../../transport/synergyManagementGatewayApiRequest';
import { toWriteResult } from '../../helpers/writeResult';
import { validateAttributes, mapAttributes } from '../../helpers/adAttributes';

import { toErrorOutput, toNodeError } from '../../helpers/errorOutput';

export const properties: INodeProperties[] = [
	{
		displayName: 'Group Name',
		name: 'name',
		type: 'string',
		default: '',
		required: true,
		description: 'CN of the group (max 15 characters)',
	},
	{
		displayName: 'Path',
		name: 'path',
		type: 'string',
		default: '',
		description: 'DN of the parent OU',
	},
	{
		displayName: 'Group Category',
		name: 'groupCategory',
		type: 'options',
		options: [
			{ name: 'Security', value: 'Security' },
			{ name: 'Distribution', value: 'Distribution' },
		],
		default: 'Security',
		description: 'The category of the group',
	},
	{
		displayName: 'Group Scope',
		name: 'groupScope',
		type: 'options',
		options: [
			{ name: 'Global', value: 'Global' },
			{ name: 'Domain Local', value: 'DomainLocal' },
			{ name: 'Universal', value: 'Universal' },
		],
		default: 'Global',
		description: 'The scope of the group',
	},
	{
		displayName: 'Group Attributes',
		name: 'groupAttributes',
		type: 'resourceMapper',
		default: {
			mappingMode: 'defineBelow',
			value: null,
		},
		required: true,
		typeOptions: {
			resourceMapper: {
				resourceMapperMethod: 'getGroupSchemaAttributes',
				mode: 'add',
				valuesLabel: 'Attribute Values',
				supportAutoMap: false,
				fieldWords: {
					singular: 'attribute',
					plural: 'attributes',
				},
				addAllFields: false,
				multiKeyMatch: true,
			},
		},
	},
];

const displayOptions = {
	show: {
		resource: ['group'],
		operation: ['create'],
	},
};

export const description = updateDisplayOptions(displayOptions, properties);

export async function execute(this: IExecuteFunctions): Promise<INodeExecutionData[]> {
	const items = this.getInputData();
	const returnData: INodeExecutionData[] = [];

	for (let i = 0; i < items.length; i++) {
		const name = this.getNodeParameter('name', i) as string;
		const path = this.getNodeParameter('path', i) as string;
		const groupCategory = this.getNodeParameter('groupCategory', i) as string;
		const groupScope = this.getNodeParameter('groupScope', i) as string;

		const attributes = this.getNodeParameter('groupAttributes', i) as IDataObject;
		try {
			validateAttributes(attributes);
			const mappedAttributes = mapAttributes(attributes);
			const body: IDataObject = {
				name,
				groupCategory,
				groupScope,
			};

			if (path) body.path = path;

			if (Object.keys(mappedAttributes).length > 0) body.attributes = mappedAttributes;

			const response = (await synergyManagementGatewayApiRequest.call(
				this,
				'POST',
				'/ad/groups',
				undefined,
				body,
			)) as IDataObject;

			const executionData = this.helpers.constructExecutionMetaData(
				this.helpers.returnJsonArray([toWriteResult(response, response)]),
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
