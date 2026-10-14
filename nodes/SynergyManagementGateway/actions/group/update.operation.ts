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
import { mapAttributes, validateAttributes } from '../../helpers/adAttributes';

import { toErrorOutput, toNodeError } from '../../helpers/errorOutput';

export const properties: INodeProperties[] = [
	{
		displayName: 'Group ID',
		name: 'groupId',
		type: 'string',
		default: '',
		required: true,
	},
	{
		displayName: 'Group Category',
		name: 'groupCategory',
		type: 'options',
		options: [
			{ name: '— No Change —', value: '' },
			{ name: 'Security', value: 'Security' },
			{ name: 'Distribution', value: 'Distribution' },
		],
		default: '',
		description: 'Set to change the group category; leave as “No Change” to keep the current value',
	},
	{
		displayName: 'Group Scope',
		name: 'groupScope',
		type: 'options',
		options: [
			{ name: '— No Change —', value: '' },
			{ name: 'Global', value: 'Global' },
			{ name: 'Domain Local', value: 'DomainLocal' },
			{ name: 'Universal', value: 'Universal' },
		],
		default: '',
		description: 'Set to change the group scope; leave as “No Change” to keep the current value',
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
		operation: ['update'],
	},
};

export const description = updateDisplayOptions(displayOptions, properties);

export async function execute(this: IExecuteFunctions): Promise<INodeExecutionData[]> {
	const items = this.getInputData();
	const returnData: INodeExecutionData[] = [];

	for (let i = 0; i < items.length; i++) {
		// Everything that can refuse the item sits inside the try, so Continue on Fail sees an invalid
		// attribute the same way it sees a refused request.
		try {
			const groupId = this.getNodeParameter('groupId', i) as string;
			const groupCategory = this.getNodeParameter('groupCategory', i, '') as string;
			const groupScope = this.getNodeParameter('groupScope', i, '') as string;

			const body: IDataObject = {};
			if (groupCategory) body.groupCategory = groupCategory;
			if (groupScope) body.groupScope = groupScope;

			const attributes = this.getNodeParameter('groupAttributes', i) as IDataObject;
			validateAttributes(attributes);
			const mappedAttributes = mapAttributes(attributes);
			if (Object.keys(mappedAttributes).length > 0) body.replace = mappedAttributes;

			// Nothing to change is still an answer for this item: dropping it would leave the workflow with
			// one item fewer than it sent and no way to tell which.
			if (Object.keys(body).length === 0) {
				returnData.push({ json: { success: true, changed: false, id: groupId }, pairedItem: { item: i } });
				continue;
			}

			const response = (await synergyManagementGatewayApiRequest.call(
				this,
				'PATCH',
				apiPath`/ad/groups/${groupId}`,
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
