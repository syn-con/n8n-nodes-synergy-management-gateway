import { type INodeProperties, updateDisplayOptions } from 'n8n-workflow';

import { createDirectoryContextRead } from '../../helpers/directoryContextRead';

// Get-ADReplicationSite.
export const properties: INodeProperties[] = [];

const displayOptions = {
	show: {
		resource: ['directoryContext'],
		operation: ['getSites'],
	},
};

export const description = updateDisplayOptions(displayOptions, properties);

export const execute = createDirectoryContextRead('/ad/sites');
