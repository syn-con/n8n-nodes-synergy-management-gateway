import { type INodeProperties, updateDisplayOptions } from 'n8n-workflow';

import { createDirectoryContextRead } from '../../helpers/directoryContextRead';

// GET /ad/delegation-templates. Static catalogue — no directory access, so it works before any AD
// connection has been configured.
export const properties: INodeProperties[] = [];

const displayOptions = {
	show: {
		resource: ['security'],
		operation: ['listDelegationTemplates'],
	},
};

export const description = updateDisplayOptions(displayOptions, properties);

export const execute = createDirectoryContextRead('/ad/delegation-templates');
