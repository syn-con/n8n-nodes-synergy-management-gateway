import type { INodeProperties } from 'n8n-workflow';

import * as getAll from './getAll.operation';
import * as create from './create.operation';
import * as getById from './getById.operation';
import * as deleteById from './deleteById.operation';
import * as update from './update.operation';
import * as enable from './enable.operation';
import * as disable from './disable.operation';
import * as resetPassword from './resetPassword.operation';

export { getAll, create, getById, deleteById, update, enable, disable, resetPassword };

export const description: INodeProperties[] = [
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: {
			show: {
				resource: ['computer'],
			},
		},
		options: [
			{ name: 'Create', value: 'create', action: 'Create a computer' },
			{ name: 'Delete By ID', value: 'deleteById', action: 'Delete by id a computer' },
			{ name: 'Disable', value: 'disable', action: 'Disable a computer' },
			{ name: 'Enable', value: 'enable', action: 'Enable a computer' },
			{ name: 'Get By ID', value: 'getById', action: 'Get by id a computer' },
			{ name: 'Get Many', value: 'getAll', action: 'Get many computers' },
			{ name: 'Reset Password', value: 'resetPassword', action: 'Reset password a computer' },
			{ name: 'Update', value: 'update', action: 'Update a computer' },
		],
		default: 'getAll',
		required: true,
	},
	...getAll.description,
	...create.description,
	...getById.description,
	...deleteById.description,
	...update.description,
	...enable.description,
	...disable.description,
	...resetPassword.description,
];
