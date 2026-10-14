import type { FieldType, ILoadOptionsFunctions, ResourceMapperField, ResourceMapperFields } from 'n8n-workflow';
import { synergyManagementGatewayApiRequest } from '../transport/synergyManagementGatewayApiRequest';

export interface SchemaAttribute {
    name: string;
    type: string;        // "String" | "Int" | "Bool" | "DN" | "Long" | "GeneralizedTime"
    isRequired: boolean;
    isSingleValued: boolean;
    isReadOnly: boolean;
}

export interface SchemaResponse {
    class: string;
    attributes: SchemaAttribute[];
}

function adTypeToFieldType(adType: string): FieldType {
    switch (adType) {
        case 'Int':
        case 'Long':
            return 'number';
        case 'Bool':
            return 'boolean';
        case 'GeneralizedTime':
        case 'FileTime':
            return 'dateTime';
        default:
            return 'string';
    }
}

async function loadSchemaFields(
    this: ILoadOptionsFunctions,
    schemaEndpoint: string,
): Promise<ResourceMapperFields> {
    

    const schema = await synergyManagementGatewayApiRequest.call(
        this, 'GET', schemaEndpoint, undefined, undefined,
    ) as SchemaResponse;

    const fields: ResourceMapperField[] = schema.attributes
        .filter(attr => !attr.isReadOnly)
        .map(attr => ({
            id: attr.name,
            displayName: `${attr.name}${attr.isRequired ? ' *' : ''} [${attr.type}${attr.isSingleValued ? '' : '[]'}]`,
            defaultMatch: false,
            required: attr.isRequired,
            display: true,
            type: adTypeToFieldType(attr.type),
        }));

        
    return { fields };
}

export async function getUserSchemaAttributes(this: ILoadOptionsFunctions): Promise<ResourceMapperFields> {

    return loadSchemaFields.call(this, '/ad/users/schema');
}

export async function getGroupSchemaAttributes(this: ILoadOptionsFunctions): Promise<ResourceMapperFields> {
    return loadSchemaFields.call(this, '/ad/groups/schema');
}

export async function getComputerSchemaAttributes(this: ILoadOptionsFunctions): Promise<ResourceMapperFields> {
    return loadSchemaFields.call(this, '/ad/computers/schema');
}

export async function getOuSchemaAttributes(this: ILoadOptionsFunctions): Promise<ResourceMapperFields> {
    return loadSchemaFields.call(this, '/ad/organization-units/schema');
}
