import {
    type IDataObject,
    type IExecuteFunctions,
    type INodeExecutionData,
    type INodeProperties,
} from 'n8n-workflow';

import {  updateDisplayOptions } from 'n8n-workflow';
import { synergyManagementGatewayApiRequest } from '../../transport/synergyManagementGatewayApiRequest';
import { apiPath } from '../../transport/apiPath';
import { toWriteResult } from '../../helpers/writeResult';
import { toErrorOutput, toNodeError } from '../../helpers/errorOutput';





export const properties: INodeProperties[]  = 
[
    {
        displayName: 'Object ID',
        name: 'objectId',
        type: 'string',
        default: '',
        required: true,
    },
]

const displayOptions = {
    show: {
        resource: ['object'],
        operation: ['deleteById'],
    }
}
export const description = updateDisplayOptions(displayOptions, properties);




export async function execute(this: IExecuteFunctions): Promise<INodeExecutionData[]>  {


    const items = this.getInputData();


    const returnData: INodeExecutionData[] = [];

    for(let i = 0; i < items.length; i++){
        const objectId = this.getNodeParameter('objectId', i) as string;

        try {
            const response = await synergyManagementGatewayApiRequest.call(this, 'DELETE', apiPath`/ad/objects/${objectId}`, undefined, undefined) as IDataObject | null;
            returnData.push({
                json: toWriteResult(response, response ?? { success: true, id: objectId }),
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