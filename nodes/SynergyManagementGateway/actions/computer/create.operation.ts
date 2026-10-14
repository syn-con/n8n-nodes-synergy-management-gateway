import {
	type IDataObject,
	type IExecuteFunctions,
	type INodeExecutionData,
	type INodeProperties,
	updateDisplayOptions,
} from 'n8n-workflow';

import { synergyManagementGatewayApiRequest } from '../../transport/synergyManagementGatewayApiRequest';
import { toWriteResult } from '../../helpers/writeResult';
import { accountPolicyProperties } from '../shared/accountPolicy.properties';
import { getAccountPolicyFromParams } from '../../helpers/accountPolicy';
import { validateAttributes, mapAttributes } from '../../helpers/adAttributes';

import { toErrorOutput, toNodeError } from '../../helpers/errorOutput';

export const properties: INodeProperties[] = [
	{
		displayName: 'Name',
		name: 'name',
		type: 'string',
		default: '',
		required: true,
		description: 'CN of the computer (max 15 characters)',
	},
	{
		displayName: 'Path',
		name: 'path',
		type: 'string',
		default: '',
		description: 'DN of the parent OU',
	},
	{
		displayName: 'SAM Account Name',
		name: 'samAccountName',
		type: 'string',
		default: '',
		description: 'Trailing $ will be appended by backend if missing',
	},
	{
		displayName: 'Password',
		name: 'password',
		type: 'string',
		typeOptions: {
			password: true,
		},
		default: '',
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
		const samAccountName = this.getNodeParameter('samAccountName', i) as string;
		const password = this.getNodeParameter('password', i) as string;
		const accountPolicy = getAccountPolicyFromParams(this, i);

		const attributes = this.getNodeParameter('computerAttributes', i) as IDataObject;
		try {
			validateAttributes(attributes);
			const mappedAttributes = mapAttributes(attributes);
			const body: IDataObject = {
				name,
			};

			if (path) body.path = path;
			if (samAccountName) body.samAccountName = samAccountName;
			if (password) body.password = password;
			if (accountPolicy) body.accountPolicy = accountPolicy;

			if (Object.keys(mappedAttributes).length > 0) body.attributes = mappedAttributes;

			const response = (await synergyManagementGatewayApiRequest.call(
				this,
				'POST',
				'/ad/computers',
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
