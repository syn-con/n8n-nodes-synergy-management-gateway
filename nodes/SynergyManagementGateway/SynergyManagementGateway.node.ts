import {
    type IExecuteFunctions,
    type INodeExecutionData,
    type INodeType,
    type INodeTypeDescription,
    NodeConnectionTypes,
} from 'n8n-workflow';

import { router } from './actions/router';
import * as object from './actions/object';
import * as user from './actions/user';
import * as group from './actions/group';
import * as computer from './actions/computer';
import * as organizationalUnit from './actions/organizationalUnit';
import * as directoryContext from './actions/directoryContext';
import * as operation from './actions/operation';
import * as security from './actions/security';
import * as serviceAccount from './actions/serviceAccount';
import { nodeOptionsProperties } from './transport/approvalPending';
import { toErrorOutput, toNodeError } from './helpers/errorOutput';
import { searchContainers } from './methods/listSearch';
import { getUserSchemaAttributes, getGroupSchemaAttributes, getComputerSchemaAttributes, getOuSchemaAttributes } from './methods/resourceMapping';
import {
    getUserSchemaAttributesOptions,
    getGroupSchemaAttributesOptions,
    getComputerSchemaAttributesOptions,
    getOuSchemaAttributesOptions,
    getSavedLdapFiltersOptions,
} from './methods/loadOptions';

export class SynergyManagementGateway implements INodeType
{
    description: INodeTypeDescription = {
        displayName: 'SYNERGY Management Gateway for Active Directory',
        // `name` is the node's *type* identifier, written into every saved workflow that uses it. It was
        // `activeDirectory` until 2.0.0, which n8n's naming rules for verified nodes do not accept; a workflow
        // saved with the 1.x node does not resolve to this one and has to have the node replaced.
        name: 'synergyManagementGateway',
        icon: {
            light: 'file:../../icons/synergy.svg',
            dark: 'file:../../icons/synergy.dark.svg',
        },
        group: ['transform'],
        // 1.1: the Base DN fields became a resource locator (tree list or raw DN); 1 keeps the plain string field.
        // 1.2: so did the parent container (Path) of every create operation; 1 and 1.1 keep the plain string.
        version: [1, 1.1, 1.2],
        subtitle: '={{ $parameter["operation"] + ": " + $parameter["resource"] }}',
        description: 'Manage Active Directory users, groups, computers and organizational units through the SYNERGY Management Gateway for Active Directory API',
        defaults: {
            name: 'SYNERGY Management Gateway for Active Directory',
        },
        inputs: [NodeConnectionTypes.Main],
        outputs: [NodeConnectionTypes.Main],
        credentials: [{ name: 'synergyManagementGatewayApi', required: true }],
        // An n8n AI agent may call the node as a tool. It acts through the same API key as any workflow, so the
        // gateway supervises it as a machine credential: what may run unasked is that key's supervision level.
        usableAsTool: true,
        properties: [
            {
                displayName: 'Resource',
                name: 'resource',
                type: 'options',
                noDataExpression: true,
                options: [
                    { name: 'Computer', value: 'computer' },
                    { name: 'Directory Context', value: 'directoryContext' },
                    { name: 'Group', value: 'group' },
                    { name: 'Object', value: 'object' },
                    { name: 'Operation', value: 'operation' },
                    { name: 'Organizational Unit', value: 'organizationalUnit' },
                    { name: 'Security', value: 'security' },
                    { name: 'Service Account', value: 'serviceAccount' },
                    { name: 'User', value: 'user' },
                ],
                default: 'object',
            },
            ...object.description,
            ...user.description,
            ...group.description,
            ...computer.description,
            ...organizationalUnit.description,
            ...directoryContext.description,
            ...operation.description,
            ...nodeOptionsProperties,
            ...security.description,
            ...serviceAccount.description,
        ],
    };

    methods = {
        listSearch: {
            searchContainers,
        },
        resourceMapping: {
            getUserSchemaAttributes,
            getGroupSchemaAttributes,
            getComputerSchemaAttributes,
            getOuSchemaAttributes,
        },
        loadOptions: {
            getUserSchemaAttributesOptions,
            getGroupSchemaAttributesOptions,
            getComputerSchemaAttributesOptions,
            getOuSchemaAttributesOptions,
            getSavedLdapFiltersOptions,
        }
    }

    async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
        // Each operation loops over the items and honours "Continue on Fail" per item. What reaches this
        // catch failed before any item was processed (an unknown resource or operation), so with "Continue on
        // Fail" on it becomes one error item for each input item rather than stopping the workflow.
        try {
            return await router.call(this);
        } catch (error) {
            if (this.continueOnFail()) {
                return [this.getInputData().map((_, i) => ({ json: toErrorOutput(error), pairedItem: { item: i } }))];
            }
            throw toNodeError(this.getNode(), error);
        }
    }
}
