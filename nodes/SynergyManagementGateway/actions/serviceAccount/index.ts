import type { INodeProperties } from 'n8n-workflow';

import * as getAll from './getAll.operation';
import * as getById from './getById.operation';
import * as create from './create.operation';
import * as update from './update.operation';
import * as deleteById from './deleteById.operation';
import * as getKdsReadiness from './getKdsReadiness.operation';
import * as getPasswordRetrievalPrincipals from './getPasswordRetrievalPrincipals.operation';
import * as setPasswordRetrievalPrincipals from './setPasswordRetrievalPrincipals.operation';
import * as getComputerServiceAccounts from './getComputerServiceAccounts.operation';
import * as setComputerLink from './setComputerLink.operation';

export {
	getAll,
	getById,
	create,
	update,
	deleteById,
	getKdsReadiness,
	getPasswordRetrievalPrincipals,
	setPasswordRetrievalPrincipals,
	getComputerServiceAccounts,
	setComputerLink,
};

/**
 * The Service Account resource: managed and group managed service accounts.
 *
 * No operation returns a managed password — there is no API endpoint that could. A group account's whole
 * property is that only the hosts named in its retrieval principals ever see it, so a workflow that needs a
 * credential for a service should run the service *as* the account rather than trying to read its password.
 */
export const description: INodeProperties[] = [
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: {
			show: {
				resource: ['serviceAccount'],
			},
		},
		options: [
			{
				name: 'Create',
				value: 'create',
				action: 'Create a service account',
				description: 'Create a managed or group managed service account. The kind cannot be changed afterwards.',
			},
			{
				name: 'Delete',
				value: 'deleteById',
				action: 'Delete a service account',
				description: 'Delete a service account. Every service configured to run as it will stop authenticating.',
			},
			{
				name: 'Get',
				value: 'getById',
				action: 'Get a service account',
				description: 'Get one service account, including who may retrieve its managed password',
			},
			{
				name: 'Get KDS Readiness',
				value: 'getKdsReadiness',
				action: 'Get KDS readiness',
				description:
					'Check whether the forest has a usable KDS root key, which a group managed service account requires',
			},
			{
				name: 'Get Many',
				value: 'getAll',
				action: 'Get many service accounts',
				description: 'Get managed and group managed service accounts',
			},
			{
				name: 'Get Many Computer Service Accounts',
				value: 'getComputerServiceAccounts',
				action: 'Get many computer service accounts',
				description: 'Get the standalone managed service accounts linked to a computer',
			},
			{
				name: 'Get Many Password Retrieval Principals',
				value: 'getPasswordRetrievalPrincipals',
				action: 'Get many password retrieval principals',
				description: 'Get who can retrieve a group managed service account password',
			},
			{
				name: 'Set Computer Link',
				value: 'setComputerLink',
				action: 'Set a computer link',
				description: 'Link or unlink a standalone managed service account and a computer',
			},
			{
				name: 'Set Password Retrieval Principals',
				value: 'setPasswordRetrievalPrincipals',
				action: 'Set password retrieval principals',
				description: 'Replace who can retrieve the managed password. This hands out a usable credential.',
			},
			{
				name: 'Update',
				value: 'update',
				action: 'Update a service account',
				description: 'Update the description, DNS host name, SPNs or enabled state',
			},
		],
		default: 'getAll',
		required: true,
	},
	...getAll.description,
	...getById.description,
	...create.description,
	...update.description,
	...deleteById.description,
	...getKdsReadiness.description,
	...getPasswordRetrievalPrincipals.description,
	...setPasswordRetrievalPrincipals.description,
	...getComputerServiceAccounts.description,
	...setComputerLink.description,
];
