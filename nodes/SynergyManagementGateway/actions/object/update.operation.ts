import {
    type IDataObject,
    type IExecuteFunctions,
    type INodeExecutionData,
    type INodeProperties,
} from 'n8n-workflow';


import { updateDisplayOptions } from 'n8n-workflow';
import { synergyManagementGatewayApiRequest } from '../../transport/synergyManagementGatewayApiRequest';
import { toWriteResult } from '../../helpers/writeResult';
import { apiPath } from '../../transport/apiPath';

import { toErrorOutput, toNodeError } from '../../helpers/errorOutput';



export const properties: INodeProperties[] = [
    {
        displayName: 'Object ID',
        name: 'objectId',
        type: 'string',
        default: '',
        required: true,
    },
    {
        displayName: 'Attribute Patches',
        name: 'attributePatches',
        type: 'fixedCollection',
        typeOptions: {
            multipleValues: true,
        },
        required: true,
        default: {},
        options: [
            {
                name: 'add',
                displayName: 'Add',
                values: [
                    {
                        displayName: 'Attribute ID',
                        name: 'id',
                        type: 'string',
                        default: '',
                        description: 'The ID of the attribute to add',
                        required: true,
                    },
                    {
                        displayName: 'Value',
                        name: 'value',
                        type: 'string',
                        default: '',
                        description: 'Value of the attribute to set',
                    },
                ],
            },
            {
                name: 'replace',
                displayName: 'Replace',
                values: [
                    {
                        displayName: 'Attribute ID',
                        name: 'id',
                        type: 'string',
                        default: '',
                        description: 'The ID of the attribute to replace',
                        required: true,
                    },
                    {
                        displayName: 'Value',
                        name: 'value',
                        type: 'string',
                        default: '',
                        description: 'Value of the attribute to replace',
                    },
                ],
            },
            {
                name: 'delete',
                displayName: 'Remove',
                values: [
                    {
                        displayName: 'Attribute ID',
                        name: 'id',
                        type: 'string',
                        default: '',
                        description: 'The ID of the attribute to remove',
                        required: true,
                    },
                    {
                        displayName: 'Value',
                        name: 'value',
                        type: 'string',
                        default: '',
                        description: 'Value of the attribute to remove',
                    },
                ],
            },
            {
                name: 'clear',
                displayName: 'Clear',
                values: [
                    {
                        displayName: 'Attribute ID',
                        name: 'id',
                        type: 'string',
                        default: '',
                        description: 'The ID of the attribute to clear',
                        required: true,
                    },
                ],
            }
        ]
    }
]

const displayOptions = {
    show: {
        resource: ['object'],
        operation: ['update'],
    }
}
export const description = updateDisplayOptions(displayOptions, properties);

export async function execute(this: IExecuteFunctions): Promise<INodeExecutionData[]> {
    const items = this.getInputData();
    const returnData: INodeExecutionData[] = [];
    for (let i = 0; i < items.length; i++) {
        const objectId = this.getNodeParameter('objectId', i) as string;
        const replacePatches = this.getNodeParameter('attributePatches.replace', i,[]) as IDataObject[];
        const deletePatches = this.getNodeParameter('attributePatches.delete', i,[]) as IDataObject[];
        const clearPatches = this.getNodeParameter('attributePatches.clear', i,[]) as IDataObject[];
        const addPatches = this.getNodeParameter('attributePatches.add', i,[]) as IDataObject[];


        // Build the attribute patch dictionaries according to the API format
        const replaceDict: IDataObject = {};
        replacePatches.forEach(patch => {
            replaceDict[patch.id as string] = patch.value;
        });

        const addDict: IDataObject = {};
        addPatches.forEach(patch => {
            const key = patch.id as string;
            const value = patch.value;
            
            if (value === undefined || value === null) {
                return;
            }
            
            const existingValue = addDict[key] as unknown[];
            if (existingValue && Array.isArray(existingValue)) {
                existingValue.push(value);
            } else {
                addDict[key] = [value];
            }
        });

        const removeDict: IDataObject = {};
        deletePatches.forEach(patch => {
            const key = patch.id as string;
            const value = patch.value;
            
            if (value === undefined || value === null) {
                return;
            }
            
            const existingValue = removeDict[key] as unknown[];
            if (existingValue && Array.isArray(existingValue)) {
                existingValue.push(value);
            } else {
                removeDict[key] = [value];
            }
        });

        // UpdateObjectRequestDto is flat: replace/add/remove/clear live at the top level,
        // not nested under an "attributes" wrapper. Lowercase keys match every other
        // AD update operation (binding is case-insensitive).
        const body: IDataObject = {
            replace: Object.keys(replaceDict).length > 0 ? replaceDict : undefined,
            add: Object.keys(addDict).length > 0 ? addDict : undefined,
            remove: Object.keys(removeDict).length > 0 ? removeDict : undefined,
            clear: clearPatches.length > 0 ? clearPatches.map(patch => patch.id) : undefined,
        }

        try {
            const response = await synergyManagementGatewayApiRequest.call(this, 'PATCH', apiPath`/ad/objects/${objectId}`, undefined, body) as IDataObject;

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
