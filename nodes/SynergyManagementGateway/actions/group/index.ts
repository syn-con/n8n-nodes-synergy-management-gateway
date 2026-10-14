import type { INodeProperties } from 'n8n-workflow';

import * as getAll from './getAll.operation';
import * as create from './create.operation';
import * as getById from './getById.operation';
import * as deleteById from './deleteById.operation';
import * as update from './update.operation';
import * as assignMember from './assignMember.operation';
import * as assignMembers from './assignMembers.operation';
import * as unassignMember from './unassignMember.operation';
import * as unassignMembers from './unassignMembers.operation';
import * as clearMembers from './clearMembers.operation';
import * as getMembers from './getMembers.operation';

export { getAll, create, getById, deleteById, update, assignMember, assignMembers, unassignMember, unassignMembers, clearMembers, getMembers };

export const description: INodeProperties[] = [
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: {
			show: {
				resource: ['group'],
			},
		},
		options: [
			{ name: 'Assign Member', value: 'assignMember', action: 'Assign member a group' },
			{ name: 'Assign Members', value: 'assignMembers', action: 'Assign members a group' },
			{ name: 'Clear Members', value: 'clearMembers', action: 'Clear members a group' },
			{ name: 'Create', value: 'create', action: 'Create a group' },
			{ name: 'Delete By ID', value: 'deleteById', action: 'Delete by id a group' },
			{ name: 'Get By ID', value: 'getById', action: 'Get by id a group' },
			{ name: 'Get Many', value: 'getAll', action: 'Get many groups' },
			{ name: 'Get Members', value: 'getMembers', action: 'Get members of a group', description: 'Get the members of a group, optionally following group nesting' },
			{ name: 'Unassign Member', value: 'unassignMember', action: 'Unassign member a group' },
			{ name: 'Unassign Members', value: 'unassignMembers', action: 'Unassign members a group' },
			{ name: 'Update', value: 'update', action: 'Update a group' },
		],
		default: 'getAll',
		required: true,
	},
	...getAll.description,
	...create.description,
	...getById.description,
	...deleteById.description,
	...update.description,
	...assignMember.description,
	...assignMembers.description,
	...unassignMember.description,
	...unassignMembers.description,
	...clearMembers.description,
	...getMembers.description,
];
