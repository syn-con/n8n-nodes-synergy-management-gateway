import { type INodeProperties, updateDisplayOptions } from 'n8n-workflow';

import { createDirectoryContextRead } from '../../helpers/directoryContextRead';

// Get-ADForest.
export const properties: INodeProperties[] = [];

const displayOptions = {
	show: {
		resource: ['directoryContext'],
		operation: ['getForest'],
	},
};

export const description = updateDisplayOptions(displayOptions, properties);

export const execute = createDirectoryContextRead('/ad/forest');
