import type { INodeProperties } from 'n8n-workflow';

import * as getAll from './getAll.operation';
import * as create from './create.operation';
import * as getById from './getById.operation';
import * as getGroups from './getGroups.operation';
import * as deleteById from './deleteById.operation';
import * as update from './update.operation';
import * as enable from './enable.operation';
import * as disable from './disable.operation';
import * as unlock from './unlock.operation';
import * as searchByState from './searchByState.operation';
import * as setAccountExpiration from './setAccountExpiration.operation';
import * as resetPassword from './resetPassword.operation';
import * as assignGroup from './assignGroup.operation';
import * as unassignGroup from './unassignGroup.operation';
import * as assignGroups from './assignGroups.operation';
import * as unassignGroups from './unassignGroups.operation';
import * as clearGroups from './clearGroups.operation';
import * as getAuthorizationGroups from './getAuthorizationGroups.operation';
import * as changePassword from './changePassword.operation';

export { getAll, create, getById, getGroups, getAuthorizationGroups, deleteById, update, enable, disable, unlock, searchByState, setAccountExpiration, resetPassword, changePassword, assignGroup, unassignGroup, assignGroups, unassignGroups, clearGroups };

export const description: INodeProperties[] = [
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: {
			show: {
				resource: ['user'],
			},
		},
		options: [
			{ name: 'Assign Group', value: 'assignGroup', action: 'Assign group a user' },
			{ name: 'Assign Groups', value: 'assignGroups', action: 'Assign groups a user' },
			{ name: 'Change Password', value: 'changePassword', action: 'Change a user password', description: 'Change the password by supplying the current one. Needs only the Change Password right and is enforced against password history and minimum age, unlike Reset Password.' },
			{ name: 'Clear Groups', value: 'clearGroups', action: 'Clear groups a user' },
			{ name: 'Create', value: 'create', action: 'Create a user' },
			{ name: 'Delete By ID', value: 'deleteById', action: 'Delete by id a user' },
			{ name: 'Disable', value: 'disable', action: 'Disable a user' },
			{ name: 'Enable', value: 'enable', action: 'Enable a user' },
			{ name: 'Get Authorization Groups', value: 'getAuthorizationGroups', action: 'Get authorization groups a user', description: 'Every group in the account access token, including the primary group and well-known groups that no memberOf read reports' },
			{ name: 'Get By ID', value: 'getById', action: 'Get by id a user' },
			{ name: 'Get Groups', value: 'getGroups', action: 'Get groups a user' },
			{ name: 'Get Many', value: 'getAll', action: 'Get many users' },
			{ name: 'Reset Password', value: 'resetPassword', action: 'Reset password a user' },
			{ name: 'Search by State', value: 'searchByState', action: 'Search users by account state', description: 'Find users that are locked out, disabled, expired, password-expired or inactive' },
			{ name: 'Set Account Expiration', value: 'setAccountExpiration', action: 'Set or clear a user account expiry', description: 'Set the date the account expires, or clear the expiry so it never expires' },
			{ name: 'Unassign Group', value: 'unassignGroup', action: 'Unassign group a user' },
			{ name: 'Unassign Groups', value: 'unassignGroups', action: 'Unassign groups a user' },
			{ name: 'Unlock', value: 'unlock', action: 'Unlock a user', description: 'Clear a lockout on a user account. Idempotent; check wasLocked in the output to see whether the account had actually been locked.' },
			{ name: 'Update', value: 'update', action: 'Update a user' },
		],
		default: 'getAll',
		required: true,
	},
	...getAll.description,
	...create.description,
	...getById.description,
	...getGroups.description,
	...deleteById.description,
	...update.description,
	...enable.description,
	...disable.description,
	...unlock.description,
	...searchByState.description,
	...setAccountExpiration.description,
	...resetPassword.description,
	...assignGroup.description,
	...unassignGroup.description,
	...assignGroups.description,
	...unassignGroups.description,
	...clearGroups.description,
	...getAuthorizationGroups.description,
	...changePassword.description,
];
