import type { ILoadOptionsFunctions, INodePropertyOptions } from 'n8n-workflow';
import { synergyManagementGatewayApiRequest } from '../transport/synergyManagementGatewayApiRequest';
import { apiPath, routeSegment } from '../transport/apiPath';
import type { SchemaResponse } from './resourceMapping';

async function loadSchemaList(
    this: ILoadOptionsFunctions,
    resource: string,
    filter?: string,
): Promise<INodePropertyOptions[]> {

    
    const schema = await synergyManagementGatewayApiRequest.call(
        this,
        'GET',
        apiPath`/ad/${routeSegment(resource)}/schema`,
        {  },
        undefined,
    ) as SchemaResponse;

    const results = schema.attributes
        .filter(a => !filter || a.name.toLowerCase().includes(filter.toLowerCase()  ))
        .map(a => ({ 
            name: `${a.name} [${a.type}${a.isSingleValued ? '' : '[]'}]` ,
             value: a.name,
            }) as INodePropertyOptions) as INodePropertyOptions[];

    return results;
}

export async function getUserSchemaAttributesOptions(
    this: ILoadOptionsFunctions,
    filter?: string,
): Promise<INodePropertyOptions[]> {
    return loadSchemaList.call(this, 'users', filter)
}
export async function getGroupSchemaAttributesOptions(
    this: ILoadOptionsFunctions,
    filter?: string,
): Promise<INodePropertyOptions[]> {
    return loadSchemaList.call(this, 'groups', filter)
}

export async function getComputerSchemaAttributesOptions(
    this: ILoadOptionsFunctions,
    filter?: string,
): Promise<INodePropertyOptions[]> {
    return loadSchemaList.call(this, 'computers', filter)
}

export async function getOuSchemaAttributesOptions(
    this: ILoadOptionsFunctions,
    filter?: string,
): Promise<INodePropertyOptions[]> {
    return loadSchemaList.call(this, 'organization-units', filter)
}

export async function getSavedLdapFiltersOptions(
	this: ILoadOptionsFunctions,
): Promise<INodePropertyOptions[]> {
	const response = (await synergyManagementGatewayApiRequest.call(
		this,
		'GET',
		'/saved-ldap-filters',
		{ pageSize: 100 },
		undefined,
	)) as { items: Array<{ id: string; name: string }> };
	return response.items.map((f) => ({ name: f.name, value: f.id }));
}