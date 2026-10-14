import {
    type IDataObject,
    type IExecuteFunctions,
    type INodeExecutionData,
    type INodeProperties,
} from 'n8n-workflow';


import {  updateDisplayOptions } from 'n8n-workflow';
import { synergyManagementGatewayApiRequest } from '../../transport/synergyManagementGatewayApiRequest';
import { apiPath, routeSegment } from '../../transport/apiPath';
import { toWriteResult } from '../../helpers/writeResult';
import { expectedClassProperty, typedRouteSegmentFor } from '../../helpers/typedObjectRoute';

import { toErrorOutput, toNodeError } from '../../helpers/errorOutput';

export const properties: INodeProperties[]  = [

    {
        displayName: 'Object ID',
        name: 'objectId',
        type: 'string',
        default: '',
        required: true,
    },
    {
        displayName: 'New Parent Distinguished Name',
        name: 'newParentDistinguishedName',
        type: 'string',
        default: '',
        required: true,
        description: 'DN of the container to move the object into, e.g. "OU=Leavers,DC=example,DC=com"',
    },
    expectedClassProperty,
]

const displayOptions = {
    show: {
        resource: ['object'],
        operation: ['move'],
    }
}
export const description = updateDisplayOptions(displayOptions, properties);

export async function execute(this: IExecuteFunctions): Promise<INodeExecutionData[]>  {
    const items = this.getInputData();
    const returnData: INodeExecutionData[] = [];
    for(let i = 0; i < items.length; i++){
        const objectId = this.getNodeParameter('objectId', i) as string;
        const newParentDistinguishedName = this.getNodeParameter('newParentDistinguishedName', i) as string;
        const expectedClass = this.getNodeParameter('expectedClass', i, '') as string;
        try {
            // With an expected class, use the typed route so the API verifies the target's class before
            // moving it; otherwise fall back to the unchecked generic route.
            const segment = typedRouteSegmentFor(expectedClass) ?? 'objects';

            const response = await synergyManagementGatewayApiRequest.call(this, 'PATCH', apiPath`/ad/${routeSegment(segment)}/${objectId}/move`, undefined, {
                newParentDistinguishedName: newParentDistinguishedName,
            }) as IDataObject;
            returnData.push({
                json: toWriteResult(response, response),
                pairedItem: { item: i },
            });
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
