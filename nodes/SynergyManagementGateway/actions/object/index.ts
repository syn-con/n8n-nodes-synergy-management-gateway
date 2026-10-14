
import type { INodeProperties } from 'n8n-workflow';
import * as getAll from './getAll.operation';
import * as create from './create.operation';
import * as getById from './getById.operation'; 
import * as deleteById from './deleteById.operation';
import * as update from './update.operation';
import * as move from './move.operation';
import * as rename from './rename.operation';
import * as runSavedSearch from './runSavedSearch.operation';
import * as searchBySavedSearch from './searchBySavedSearch.operation';
export { getAll, create, getById, deleteById, update, move, rename, runSavedSearch, searchBySavedSearch };

export const description: INodeProperties[] = [
    {
        displayName: 'Operation',
        name: 'operation',
        type: 'options',
								noDataExpression: true,
        placeholder: 'Select an operation',
        options: [
            { name: 'Create', value: 'create', action: 'Create an object' },
            { name: 'Delete By ID', value: 'deleteById', action: 'Delete by id an object' },
            { name: 'Get By ID', value: 'getById', action: 'Get by id an object' },
            { name: 'Get Many', value: 'getAll', action: 'Get many objects' },
            { name: 'Move', value: 'move', action: 'Move an object' },
            { name: 'Rename', value: 'rename', action: 'Rename an object' },
            { name: 'Run Saved Search', value: 'runSavedSearch', action: 'Run saved search an object' },
            { name: 'Search by Saved Search', value: 'searchBySavedSearch', action: 'Search by saved search an object' },
            { name: 'Update', value: 'update', action: 'Update an object' },
        ],
        default: 'getAll',
        required: true,
        displayOptions: {
            show: {
                resource: ['object'],
            },
        },
    },
    ...getAll.description,
    ...create.description,
    ...getById.description,
    ...deleteById.description,
    ...update.description,
    ...move.description,
    ...rename.description,
    ...runSavedSearch.description,
    ...searchBySavedSearch.description,
]