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
		displayName: 'OU ID',
		name: 'ouId',
		type: 'string',
		default: '',
		required: true,
	},
	{
		displayName: 'Attributes',
		name: 'ouAttributes',
		type: 'resourceMapper',
		default: {
			mappingMode: 'defineBelow',
			value: null,
		},
		required: true,
		typeOptions: {
			resourceMapper: {
				resourceMapperMethod: 'getOuSchemaAttributes',
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
		resource: ['organizationalUnit'],
		operation: ['update'],
	},
};

export const description = updateDisplayOptions(displayOptions, properties);

export async function execute(this: IExecuteFunctions): Promise<INodeExecutionData[]> {
	const items = this.getInputData();
	const returnData: INodeExecutionData[] = [];

	for (let i = 0; i < items.length; i++) {
		const ouId = this.getNodeParameter('ouId', i) as string;

		const body: IDataObject = {};


		const attributes = this.getNodeParameter('ouAttributes', i) as IDataObject;
		validateAttributes(attributes);
		const mappedAttributes = mapAttributes(attributes);
		if (Object.keys(mappedAttributes).length > 0) 
			body.replace = mappedAttributes;	
		else{
			continue;
		}



		try {
			const response = (await synergyManagementGatewayApiRequest.call(
				this,
				'PATCH',
				apiPath`/ad/organization-units/${ouId}`,
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
