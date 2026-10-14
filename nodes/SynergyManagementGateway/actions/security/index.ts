import type { INodeProperties } from 'n8n-workflow';

import * as getAcl from './getAcl.operation';
import * as listDelegationTemplates from './listDelegationTemplates.operation';
import * as getDelegations from './getDelegations.operation';
import * as applyDelegation from './applyDelegation.operation';
import * as revokeDelegation from './revokeDelegation.operation';
import * as setDeletionProtection from './setDeletionProtection.operation';
import * as getSpns from './getSpns.operation';
import * as setSpns from './setSpns.operation';

export {
	getAcl,
	listDelegationTemplates,
	getDelegations,
	applyDelegation,
	revokeDelegation,
	setDeletionProtection,
	getSpns,
	setSpns,
};

/**
 * The Security resource: reading access control lists, applying named delegations, protecting an OU from
 * deletion and managing service principal names.
 *
 * Raw access-control-entry writes and owner changes are deliberately absent, though the REST API offers
 * them. A named delegation is a reviewable unit — the template states what it permits and the node can
 * show that in its own description — whereas an arbitrary entry is not: the difference between a correct
 * grant and one that hands over the domain is an omitted object-type GUID, and a workflow applies it
 * unattended with nobody reading the request. Those operations stay on the REST surface, where a human
 * composes each one.
 */
export const description: INodeProperties[] = [
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: {
			show: {
				resource: ['security'],
			},
		},
		options: [
			{
				name: 'Apply Delegation',
				value: 'applyDelegation',
				action: 'Apply a delegation',
				description:
					'Delegate control of a container to a group using a named template, as the Delegation of Control Wizard does',
			},
			{
				name: 'Get ACL',
				value: 'getAcl',
				action: 'Get an ACL',
				description:
					'Get the decoded access control list of any object: owner, entries with resolved trustees and rights, and whether inheritance is blocked',
			},
			{
				name: 'Get Many Delegation Templates',
				value: 'listDelegationTemplates',
				action: 'Get many delegation templates',
				description:
					'Get the available delegation templates and the access-control entries each expands to',
			},
			{
				name: 'Get Many Delegations',
				value: 'getDelegations',
				action: 'Get many delegations',
				description: 'Report which delegation templates are present on a container, per trustee',
			},
			{
				name: 'Get Service Principal Names',
				value: 'getSpns',
				action: 'Get service principal names',
				description:
					'Get the SPNs of a user or computer, and whether the account is therefore Kerberoastable',
			},
			{
				name: 'Revoke Delegation',
				value: 'revokeDelegation',
				action: 'Revoke a delegation',
				description: 'Remove the access-control entries a delegation template defines for a trustee',
			},
			{
				name: 'Set Deletion Protection',
				value: 'setDeletionProtection',
				action: 'Set deletion protection',
				description:
					'Protect an organizational unit from accidental deletion, or allow it to be deleted',
			},
			{
				name: 'Set Service Principal Names',
				value: 'setSpns',
				action: 'Set service principal names',
				description: 'Replace the complete set of SPNs on a user or computer. Writing one makes the account a Kerberos service target.',
			},
		],
		default: 'getAcl',
		required: true,
	},
	...getAcl.description,
	...listDelegationTemplates.description,
	...getDelegations.description,
	...applyDelegation.description,
	...revokeDelegation.description,
	...setDeletionProtection.description,
	...getSpns.description,
	...setSpns.description,
];
