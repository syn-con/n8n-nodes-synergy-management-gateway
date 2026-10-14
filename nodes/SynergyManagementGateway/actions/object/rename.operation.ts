import {
    type IDataObject,
    type IExecuteFunctions,
    type INodeExecutionData,
    type INodeProperties,
} from 'n8n-workflow';

import {  updateDisplayOptions } from 'n8n-workflow';
import { activeDirectoryApiRequest } from '../../transport/activeDirectoryApiRequest';
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
        displayName: 'New Object Name',
        name: 'newObjectName',
        type: 'string',
        default: '',
        required: true,
        description: 'The new name without an attribute prefix (e.g. "New Name", not "CN=New Name"). Must not contain , + " &lt; &gt; ; = or line breaks, which are reserved in a distinguished name.',
    },
    expectedClassProperty,
]

const displayOptions = {
    show: {
        resource: ['object'],
        operation: ['rename'],
    }
}
export const description = updateDisplayOptions(displayOptions, properties);


export async function execute(this: IExecuteFunctions): Promise<INodeExecutionData[]>  {
    const items = this.getInputData();
    const returnData: INodeExecutionData[] = [];
    for(let i = 0; i < items.length; i++){
        const objectId = this.getNodeParameter('objectId', i) as string;
        const newObjectName = this.getNodeParameter('newObjectName', i) as string;
        const expectedClass = this.getNodeParameter('expectedClass', i, '') as string;
        try {
            // With an expected class, use the typed route so the API verifies the target's class before
            // renaming it; otherwise fall back to the unchecked generic route.
            const segment = typedRouteSegmentFor(expectedClass) ?? 'objects';

            const response = await activeDirectoryApiRequest.call(this, 'PATCH', apiPath`/ad/${routeSegment(segment)}/${objectId}/rename`, undefined, {
                newName: newObjectName,
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
