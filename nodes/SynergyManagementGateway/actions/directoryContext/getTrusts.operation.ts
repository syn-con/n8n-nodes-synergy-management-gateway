import { type INodeProperties, updateDisplayOptions } from 'n8n-workflow';

import { createDirectoryContextRead } from '../../helpers/directoryContextRead';

// Get-ADTrust. Read-only; the AD module has no trust CRUD.
export const properties: INodeProperties[] = [];

const displayOptions = {
	show: {
		resource: ['directoryContext'],
		operation: ['getTrusts'],
	},
};

export const description = updateDisplayOptions(displayOptions, properties);

export const execute = createDirectoryContextRead('/ad/trusts');
