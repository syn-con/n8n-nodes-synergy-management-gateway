import type { INodeProperties } from 'n8n-workflow';

import * as getWaiting from './getWaiting.operation';
import * as getById from './getById.operation';
import * as waitForApproval from './waitForApproval.operation';

export { getWaiting, getById, waitForApproval };

export const description: INodeProperties[] = [
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: {
			show: {
				resource: ['operation'],
			},
		},
		options: [
			{
				name: 'Get By ID',
				value: 'getById',
				action: 'Get an operation by id',
			},
			{
				name: 'Get Waiting',
				value: 'getWaiting',
				action: 'Get many waiting operations',
			},
			{
				name: 'Wait for Approval',
				value: 'waitForApproval',
				action: 'Wait for an approval decision',
			},
		],
		default: 'getWaiting',
		required: true,
	},
	...getWaiting.description,
	...getById.description,
	...waitForApproval.description,
];
