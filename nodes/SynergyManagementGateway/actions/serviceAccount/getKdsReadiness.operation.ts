import { type INodeProperties, updateDisplayOptions } from 'n8n-workflow';

import { createDirectoryContextRead } from '../../helpers/directoryContextRead';

// GET /ad/service-accounts/kds-readiness. Worth calling before a group create: AD reports a missing or
// not-yet-effective KDS root key as a generic constraint violation naming neither cause nor remedy.
export const properties: INodeProperties[] = [];

const displayOptions = {
	show: {
		resource: ['serviceAccount'],
		operation: ['getKdsReadiness'],
	},
};

export const description = updateDisplayOptions(displayOptions, properties);

export const execute = createDirectoryContextRead('/ad/service-accounts/kds-readiness');
