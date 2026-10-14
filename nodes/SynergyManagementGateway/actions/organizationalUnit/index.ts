import type { INodeProperties } from 'n8n-workflow';

import * as getAll from './getAll.operation';
import * as create from './create.operation';
import * as getById from './getById.operation';
import * as deleteById from './deleteById.operation';
import * as update from './update.operation';
import * as previewAccountState from './previewAccountState.operation';
import * as enableAccounts from './enableAccounts.operation';
import * as disableAccounts from './disableAccounts.operation';

export { getAll, create, getById, deleteById, update, previewAccountState, enableAccounts, disableAccounts };

export const description: INodeProperties[] = [
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: {
			show: {
				resource: ['organizationalUnit'],
			},
		},
		options: [
			{ name: 'Create', value: 'create', action: 'Create an organizational unit' },
			{ name: 'Delete By ID', value: 'deleteById', action: 'Delete by id an organizational unit' },
			{
				name: 'Disable Accounts',
				value: 'disableAccounts',
				action: 'Disable the accounts in an organizational unit',
			},
			{
				name: 'Enable Accounts',
				value: 'enableAccounts',
				action: 'Enable the accounts in an organizational unit',
			},
			{ name: 'Get By ID', value: 'getById', action: 'Get by id an organizational unit' },
			{ name: 'Get Many', value: 'getAll', action: 'Get many organizational units' },
			{
				name: 'Preview Account Enable/Disable',
				value: 'previewAccountState',
				action: 'Preview enabling or disabling the accounts in an organizational unit',
			},
			{ name: 'Update', value: 'update', action: 'Update an organizational unit' },
		],
		default: 'getAll',
		required: true,
	},
	...getAll.description,
	...create.description,
	...getById.description,
	...deleteById.description,
	...update.description,
	...previewAccountState.description,
	...enableAccounts.description,
	...disableAccounts.description,
];
