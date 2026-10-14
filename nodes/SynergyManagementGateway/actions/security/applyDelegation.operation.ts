import {
	type IDataObject,
	type IExecuteFunctions,
	type INodeExecutionData,
	type INodeProperties,
	updateDisplayOptions,
} from 'n8n-workflow';

import { activeDirectoryApiRequest } from '../../transport/activeDirectoryApiRequest';
import { toWriteResult } from '../../helpers/writeResult';
import { apiPath } from '../../transport/apiPath';
import { toErrorOutput, toNodeError } from '../../helpers/errorOutput';
import {
	delegationTemplateProperty,
	readTrustee,
	trusteeProperties,
} from '../../helpers/trustee';

// POST /ad/objects/{id}/delegations — one task of the Delegation of Control Wizard.
export const properties: INodeProperties[] = [
	{
		displayName: 'Object ID',
		name: 'objectId',
		type: 'string',
		default: '',
		required: true,
		description: 'The object GUID of the container to delegate control of. Apply the delegation to the narrowest container that covers the actual need — a password-reset delegation at the domain root reaches every account in the domain, including the administrative ones.',
	},
	delegationTemplateProperty,
	...trusteeProperties,
];

const displayOptions = {
	show: {
		resource: ['security'],
		operation: ['applyDelegation'],
	},
};

export const description = updateDisplayOptions(displayOptions, properties);

export async function execute(this: IExecuteFunctions): Promise<INodeExecutionData[]> {
	const items = this.getInputData();
	const returnData: INodeExecutionData[] = [];

	for (let i = 0; i < items.length; i++) {
		const objectId = this.getNodeParameter('objectId', i) as string;
		const template = this.getNodeParameter('template', i) as string;

		try {
			const body: IDataObject = { template, ...readTrustee(this, i) };

			const response = (await activeDirectoryApiRequest.call(
				this,
				'POST',
				apiPath`/ad/objects/${objectId}/delegations`,
				undefined,
				body,
			)) as IDataObject | undefined;

			// `changed` and `warnings` are forwarded rather than reduced to success, because both carry
			// information a workflow can act on: changed=false means the delegation was already fully in
			// place, and the warnings state what it actually confers.
			returnData.push({
				json: toWriteResult(response, {
					success: true,
					objectId,
					template,
					...response,
				}),
				pairedItem: { item: i },
			});
		} catch (error) {
			if (this.continueOnFail()) {
				returnData.push({ json: toErrorOutput(error), pairedItem: { item: i } });
				continue;
			}
			throw toNodeError(this.getNode(), error, i);
		}
	}

	return returnData;
}
