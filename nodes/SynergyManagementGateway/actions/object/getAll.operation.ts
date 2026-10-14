import {
    type IDataObject,
    type IExecuteFunctions,
    type INodeExecutionData,
    type INodeProperties,
} from 'n8n-workflow';

import { updateDisplayOptions } from 'n8n-workflow';

import { synergyManagementGatewayApiRequest } from '../../transport/synergyManagementGatewayApiRequest';
import { toErrorOutput, toNodeError } from '../../helpers/errorOutput';

const BATCH_SIZE = 100;

export const properties: INodeProperties[] = 
[
    {
        displayName: 'Object Type',
        name: 'objectType',
        type: 'options',
        options: [
            { name: 'Computer', value: 'computer' },
            { name: 'Contact', value: 'contact' },
            { name: 'Group', value: 'group' },
            { name: 'Organizational Unit', value: 'organizationalUnit' },
            { name: 'User', value: 'user' },
        ],
        default: 'user',
        required: true,
    },
    {
        displayName: 'Path',
        name: 'path',
        type: 'string',
        default: '',
        required: true,
    },
    //LDAP filter
    {
        displayName: 'LDAP Filter',
        name: 'ldapFilter',
        type: 'string',
        default: '',

    },

    //selecct all bool 
    {
        displayName: 'Return All',
        name: 'returnAll',
        type: 'boolean',
								description: 'Whether to return all results or only up to a given limit',
        default: false,

    },
    //limit  
    {
        displayName: 'Limit',
        name: 'limit',
        type: 'number',
								typeOptions: {
									minValue: 1,
								},
								description: 'Max number of results to return',
        default: 50,


        displayOptions: {
            show: {
                returnAll: [false],
            },
        },
    },
    {
        displayName: 'Other Attributes to Select',
        name: 'otherAttributes',
        placeholder: 'Add Other Attribute',
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
        ]
    },
]


const displayOptions = {
    show: {
        resource: ['object'],
        operation: ['getAll'],
    }
}
export const description = updateDisplayOptions(displayOptions, properties);
export async function execute(this: IExecuteFunctions): Promise<INodeExecutionData[]> {
	const items = this.getInputData();
	const returnData: INodeExecutionData[] = [];
	for (let i = 0; i < items.length; i++) {
		try {
			const objectType = this.getNodeParameter('objectType', i) as string;
			const path = this.getNodeParameter('path', i) as string;
			const ldapFilter = this.getNodeParameter('ldapFilter', i) as string;
			const returnAll = this.getNodeParameter('returnAll', i) as boolean;
			const limit = this.getNodeParameter('limit', i, 500) as number;

			const qs: IDataObject = {
				class: objectType,
				baseDn: path,
				ldapFilter: ldapFilter,
				pageSize: returnAll ? BATCH_SIZE : limit > BATCH_SIZE ? BATCH_SIZE : limit,
			};

			const otherAttributes = this.getNodeParameter('otherAttributes.attribute', i, []) as IDataObject[];

			if (otherAttributes && otherAttributes.length > 0) {
				qs.properties = otherAttributes.map((attribute) => attribute.attributeName);
			}
			let records: IDataObject[] = [];

			while (returnAll || records.length < limit) {
				const response = (await synergyManagementGatewayApiRequest.call(
					this,
					'GET',
					'/ad/objects',
					qs,
					undefined,
				)) as IGetAllResponse;
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

export interface IGetAllResponse {
    data: IDataObject[]
    meta: IGetAllResponseMeta
    links: IGetAllResponseLinks
  }
  export interface IGetAllResponseMeta {
    nextContinuationToken: string
    pageSize: number
    hasNextPage: boolean
  }
  
  export interface IGetAllResponseLinks {
    current: string
    next: string
  }
  