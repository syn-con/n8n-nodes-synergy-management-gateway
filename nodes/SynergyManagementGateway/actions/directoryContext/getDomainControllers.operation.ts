import { type INodeProperties, updateDisplayOptions } from 'n8n-workflow';

import { createDirectoryContextRead } from '../../helpers/directoryContextRead';

// Get-ADDomainController. One item per DC.
export const properties: INodeProperties[] = [];

const displayOptions = {
	show: {
		resource: ['directoryContext'],
		operation: ['getDomainControllers'],
	},
};

export const description = updateDisplayOptions(displayOptions, properties);

export const execute = createDirectoryContextRead('/ad/domain-controllers');
