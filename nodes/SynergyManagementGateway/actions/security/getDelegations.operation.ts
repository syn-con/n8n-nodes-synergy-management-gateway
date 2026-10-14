import {
	type IDataObject,
	type IExecuteFunctions,
	type INodeExecutionData,
	type INodeProperties,
	updateDisplayOptions,
} from 'n8n-workflow';

import { activeDirectoryApiRequest } from '../../transport/activeDirectoryApiRequest';
import { apiPath } from '../../transport/apiPath';
import { toErrorOutput, toNodeError } from '../../helpers/errorOutput';

// GET /ad/objects/{id}/delegations
export const properties: INodeProperties[] = [
	{
		displayName: 'Object ID',
		name: 'objectId',
		type: 'string',
		default: '',
		required: true,
		description: 'The object GUID of the container — normally an organizational unit',
	},
	{
		displayName: 'Complete Delegations Only',
		name: 'completeOnly',
		type: 'boolean',
		default: false,
		description: 'Whether to return only delegations whose full set of entries is present. An incomplete match normally means the delegation was edited by hand or applied by another tool, so excluding it hides a real finding — leave this off when auditing.',
	},
];

const displayOptions = {
	show: {
		resource: ['security'],
		operation: ['getDelegations'],
	},
};

export const description = updateDisplayOptions(displayOptions, properties);

export async function execute(this: IExecuteFunctions): Promise<INodeExecutionData[]> {
	const items = this.getInputData();
	const returnData: INodeExecutionData[] = [];

	for (let i = 0; i < items.length; i++) {
		const objectId = this.getNodeParameter('objectId', i) as string;
		const completeOnly = this.getNodeParameter('completeOnly', i, false) as boolean;

		try {
			const response = (await activeDirectoryApiRequest.call(
				this,
				'GET',
				apiPath`/ad/objects/${objectId}/delegations`,
				undefined,
				undefined,
			)) as IDataObject | IDataObject[] | undefined;

			// Normalised rather than assumed to be an array: an object with no delegations legitimately
			// yields an empty body, and assuming the collection shape would turn that into a crash inside
			// the node instead of an empty result.
			const grants =
				response === undefined || response === null
					? []
					: Array.isArray(response)
						? response
						: [response];

			const rows = completeOnly ? grants.filter((g) => g['isComplete'] === true) : grants;

			// One item per grant, so a downstream IF or loop can act on each without unwrapping an array.
			const executionData = this.helpers.constructExecutionMetaData(
				this.helpers.returnJsonArray(rows),
				{ itemData: { item: i } },
			);
			returnData.push(...executionData);
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
