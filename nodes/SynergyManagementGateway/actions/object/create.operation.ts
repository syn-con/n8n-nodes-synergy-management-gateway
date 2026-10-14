import {
    type IDataObject,
    type IExecuteFunctions,
    type INodeExecutionData,
    type INodeProperties,
} from 'n8n-workflow';

import {  updateDisplayOptions } from 'n8n-workflow';

import { synergyManagementGatewayApiRequest } from '../../transport/synergyManagementGatewayApiRequest';
import { toWriteResult } from '../../helpers/writeResult';

import { toErrorOutput, toNodeError } from '../../helpers/errorOutput';

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
        displayName: 'Object Name',
        name: 'objectName',
        type: 'string',
        default: '',
        required: true,
    },
    {
        displayName: 'Path',
        name: 'path',
        type: 'string',
        default: '',
        required: true,
    },
    {
        displayName: 'Attributes',
        name: 'otherAttributes',
        placeholder: 'Add Attribute',
        type: 'fixedCollection',
        typeOptions: {
            multipleValues: true,
        },
        default: {},
        description: 'Additional LDAP attributes to set on the object',
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
                    {
                        displayName: 'Attribute Value',
                        name: 'attributeValue',
                        type: 'string',
                        default: '',
                    },
                ],
            },
        ]
    }
];

const displayOptions = {
    show: {
        resource: ['object'],
        operation: ['create'],
    }
}
export const description = updateDisplayOptions(displayOptions, properties);
export async function execute(this: IExecuteFunctions): Promise<INodeExecutionData[]>  {

    const items = this.getInputData();

    const returnData: INodeExecutionData[] = [];


    for(let i = 0; i < items.length; i++){
        const objectType = this.getNodeParameter('objectType', i) as string;
        const objectName = this.getNodeParameter('objectName', i) as string;
        const path = this.getNodeParameter('path', i) as string;
        const attributeEntries = this.getNodeParameter('otherAttributes.attribute', i, []) as IDataObject[];

        // CreateObjectRequestDto expects `attributes` as a name -> value map.
        const attributes: IDataObject = {};
        for (const entry of attributeEntries) {
            const attributeName = entry.attributeName as string;
            if (attributeName) {
                attributes[attributeName] = entry.attributeValue;
            }
        }

        try{
            const body: IDataObject = {
                "objectClass": objectType,
                "name": objectName,
                "path": path,
            }

            if (Object.keys(attributes).length > 0) {
                body.attributes = attributes;
            }

            const response = await synergyManagementGatewayApiRequest.call(
                this,
                'POST',
                `/ad/objects`,
                undefined,
                body,
            ) as IDataObject;

            const executionData = this.helpers.constructExecutionMetaData(
                this.helpers.returnJsonArray([toWriteResult(response, response)]),
                { itemData: { item: i } },
            );
            returnData.push(...executionData);

        }
        catch(error){
            if(this.continueOnFail()){
                returnData.push({ json: toErrorOutput(error), pairedItem: { item: i } });
            }
            else{
                throw toNodeError(this.getNode(), error, i);
            }
        }
    }
    return returnData;
}
