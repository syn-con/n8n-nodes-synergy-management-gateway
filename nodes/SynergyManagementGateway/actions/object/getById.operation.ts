import {
    type IDataObject,
    type IExecuteFunctions,
    type INodeExecutionData,
    type INodeProperties,
} from 'n8n-workflow';

import { updateDisplayOptions } from 'n8n-workflow';

import { activeDirectoryApiRequest } from '../../transport/activeDirectoryApiRequest';
import { apiPath } from '../../transport/apiPath';

import { toErrorOutput, toNodeError } from '../../helpers/errorOutput';

export const properties: INodeProperties[] =
    [


        //id
        {
            displayName: 'ID',
            name: 'id',
            type: 'string',
            default: '',
            required: true,
        },
        {
            displayName: 'Object Class',
            name: 'objectClass',
            type: 'string',
            default: '',
            description: 'Optional: Filter by specific object class (e.g., user, group, computer)',
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
		resource: ['object'],
		operation: ['getById'],
	},
};

export const description = updateDisplayOptions(displayOptions, properties);

export async function execute(this: IExecuteFunctions): Promise<INodeExecutionData[]> {
	const items = this.getInputData();
	const returnData: INodeExecutionData[] = [];

	for (let i = 0; i < items.length; i++) {
		const id = this.getNodeParameter('id', i) as string;
		const objectClass = this.getNodeParameter('objectClass', i, '') as string;
		const propertiesRaw = (this.getNodeParameter('properties.attribute', i, []) as IDataObject[]).map(
			(attr) => attr.attributeName,
		);

		const qs: IDataObject = {};
		if (objectClass) {
			qs.objectClass = objectClass;
		}
		if (propertiesRaw.length > 0) {
			qs.properties = propertiesRaw;
		}

		try {
			const response = (await activeDirectoryApiRequest.call(
				this,
				'GET',
				apiPath`/ad/objects/${id}`,
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
