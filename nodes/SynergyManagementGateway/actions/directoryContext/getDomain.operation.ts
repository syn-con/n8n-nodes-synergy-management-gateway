import { type INodeProperties, updateDisplayOptions } from 'n8n-workflow';

import { createDirectoryContextRead } from '../../helpers/directoryContextRead';

// Get-ADDomain. Its distinguishedName is the baseDn other AD operations need.
export const properties: INodeProperties[] = [];

const displayOptions = {
	show: {
		resource: ['directoryContext'],
		operation: ['getDomain'],
	},
};

export const description = updateDisplayOptions(displayOptions, properties);

export const execute = createDirectoryContextRead('/ad/domain');
