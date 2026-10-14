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
import { accountPolicyProperties } from '../shared/accountPolicy.properties';
import { getAccountPolicyFromParams } from '../../helpers/accountPolicy';
import { validateAttributes, mapAttributes } from '../../helpers/adAttributes';

import { toErrorOutput, toNodeError } from '../../helpers/errorOutput';

export const properties: INodeProperties[] = [

	{
		displayName: 'Computer ID',
		name: 'computerId',
		type: 'string',
		default: '',
		required: true,
		description: 'GUID of the computer',
	},
	{
		displayName: 'SAM Account Name',
		name: 'samAccountName',
		type: 'string',
		default: '',
		description: 'New SAM Account Name for the computer (rename). Trailing $ is appended automatically.',
	},
	accountPolicyProperties,
	//
	{
		displayName: 'Computer Attributes',
		name: 'computerAttributes',
		type: 'resourceMapper',
		default: {
			mappingMode: 'defineBelow',
			value: null,
		},
		required: true,
		typeOptions: {
			resourceMapper: {
				resourceMapperMethod: 'getComputerSchemaAttributes',
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
		resource: ['computer'],
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
			const computerId = this.getNodeParameter('computerId', i) as string;
			const samAccountName = this.getNodeParameter('samAccountName', i, '') as string;
			const accountPolicy = getAccountPolicyFromParams(this, i);

			const body: IDataObject = {};

			if (samAccountName) body.samAccountName = samAccountName;
			if (accountPolicy) body.accountPolicy = accountPolicy;
			const attributes = this.getNodeParameter('computerAttributes', i) as IDataObject;
			validateAttributes(attributes);
			const mappedAttributes = mapAttributes(attributes);
			if (Object.keys(mappedAttributes).length > 0) body.replace = mappedAttributes;

			// Nothing to change is still an answer for this item: dropping it would leave the workflow with
			// one item fewer than it sent and no way to tell which.
			if (Object.keys(body).length === 0) {
				returnData.push({ json: { success: true, changed: false, id: computerId }, pairedItem: { item: i } });
				continue;
			}

			const response = (await synergyManagementGatewayApiRequest.call(
				this,
				'PATCH',
				apiPath`/ad/computers/${computerId}`,
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
