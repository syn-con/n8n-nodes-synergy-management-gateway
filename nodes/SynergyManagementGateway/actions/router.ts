import { toNodeError } from '../helpers/errorOutput';
import type { IExecuteFunctions, INodeExecutionData } from 'n8n-workflow';
import { NodeOperationError } from 'n8n-workflow';

import * as object from './object';
import * as user from './user';
import * as group from './group';
import * as computer from './computer';
import * as organizationalUnit from './organizationalUnit';
import * as directoryContext from './directoryContext';
import * as operationResource from './operation';
import * as security from './security';
import * as serviceAccount from './serviceAccount';


import { ActiveDirectoryNodeType } from './node.type';



export async function router(this: IExecuteFunctions)
{

    
    let returnData: INodeExecutionData[] = [];


    try{
        const resource = this.getNodeParameter('resource', 0) as string;
        const operation = this.getNodeParameter('operation', 0) as string;

        if(!resource || !operation){
            throw new NodeOperationError(this.getNode(), 'Resource and operation are required');
        }

        const ad  = {
            resource,
            operation ,
        } as ActiveDirectoryNodeType;

        switch(ad.resource){
            case 'object':
                returnData = await object[ad.operation].execute.call(this);
                break;
            case 'user':
                returnData = await user[ad.operation].execute.call(this);
                break;
            case 'group':
                returnData = await group[ad.operation].execute.call(this);
                break;
            case 'computer':
                returnData = await computer[ad.operation].execute.call(this);
                break;
            case 'organizationalUnit':
                returnData = await organizationalUnit[ad.operation].execute.call(this);
                break;
            case 'directoryContext':
                returnData = await directoryContext[ad.operation].execute.call(this);
                break;
            case 'operation':
                returnData = await operationResource[ad.operation].execute.call(this);
                break;
            case 'security':
                returnData = await security[ad.operation].execute.call(this);
                break;
            case 'serviceAccount':
                returnData = await serviceAccount[ad.operation].execute.call(this);
                break;
            default:
                throw new NodeOperationError(this.getNode(), `The operation "${operation}" for resource "${resource}" is not supported`);
        }


       





    }catch(error){
        // Preserve structured errors (NodeApiError carries the API status code + problem body;
        // NodeOperationError carries item context). Only wrap genuinely unexpected errors.
        throw toNodeError(this.getNode(), error);
    }

    return [returnData];



}