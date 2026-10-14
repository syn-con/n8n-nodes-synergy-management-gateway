import {
	type IDataObject,
	type IExecuteFunctions,
	type INodeExecutionData,
} from 'n8n-workflow';

import { activeDirectoryApiRequest } from '../transport/activeDirectoryApiRequest';
import { toErrorOutput, toNodeError } from './errorOutput';

/**
 * Builds the `execute` function for a directory-context read.
 *
 * Every operation on this resource is the same shape — a parameterless GET whose response is either a
 * single object or an array — so the request, the array/object normalisation and the `continueOnFail`
 * handling live here rather than being copied eleven times.
 *
 * The response is split into one n8n item per element when the endpoint returns a collection, which is
 * what downstream nodes expect: a Domain Controllers read should fan out to one item per DC so it can
 * feed an IF or a loop directly, not arrive as a single item wrapping an array.
 */
export function createDirectoryContextRead(endpoint: string) {
	return async function execute(this: IExecuteFunctions): Promise<INodeExecutionData[]> {
		const items = this.getInputData();
		const returnData: INodeExecutionData[] = [];

		for (let i = 0; i < items.length; i++) {
			try {
				const response = (await activeDirectoryApiRequest.call(
					this,
					'GET',
					endpoint,
					undefined,
					undefined,
				)) as IDataObject | IDataObject[] | undefined;

				// A 204 yields no body; an empty result is a legitimate answer here (a forest may have no
				// site links and no KDS root key), so emit nothing rather than an item full of nulls.
				const payload = response === undefined || response === null ? [] : response;
				const rows = Array.isArray(payload) ? payload : [payload];

				const executionData = this.helpers.constructExecutionMetaData(
					this.helpers.returnJsonArray(rows),
					{ itemData: { item: i } },
				);
				returnData.push(...executionData);
			} catch (error) {
				if (this.continueOnFail()) {
					returnData.push({
						json: toErrorOutput(error),
						pairedItem: { item: i },
					});
					continue;
				}
				throw toNodeError(this.getNode(), error, i);
			}
		}

		return returnData;
	};
}
