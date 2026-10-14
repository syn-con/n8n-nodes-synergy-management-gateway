import {
	type IDataObject,
	type IExecuteFunctions,
	type INodeExecutionData,
	type INodeProperties,
	updateDisplayOptions,
} from 'n8n-workflow';

import { synergyManagementGatewayApiRequest } from '../../transport/synergyManagementGatewayApiRequest';
import { toWriteResult } from '../../helpers/writeResult';
import { apiPath } from '../../transport/apiPath';
import { toErrorOutput, toNodeError } from '../../helpers/errorOutput';
import {
	delegationTemplateProperty,
	readTrustee,
	trusteeProperties,
} from '../../helpers/trustee';

// DELETE /ad/objects/{id}/delegations
export const properties: INodeProperties[] = [
	{
		displayName: 'Object ID',
		name: 'objectId',
		type: 'string',
		default: '',
		required: true,
		description: 'The object GUID of the container to revoke the delegation from',
	},
	delegationTemplateProperty,
	...trusteeProperties,
];

const displayOptions = {
	show: {
		resource: ['security'],
		operation: ['revokeDelegation'],
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

			const response = (await synergyManagementGatewayApiRequest.call(
				this,
				'DELETE',
				apiPath`/ad/objects/${objectId}/delegations`,
				undefined,
				body,
			)) as IDataObject | undefined;

			// A partial revoke is a success with warnings, not a failure — so the workflow has to be able
			// to see it. entriesRemoved below the template's total means the trustee may retain part of the
			// delegation, and revoking never touches what they hold through another group or an inherited
			// entry defined on a parent container.
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
