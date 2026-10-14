import {
	type IDataObject,
	type IExecuteFunctions,
	type INodeExecutionData,
	type INodeProperties,
	updateDisplayOptions,
} from 'n8n-workflow';

import { activeDirectoryApiRequest } from '../../transport/activeDirectoryApiRequest';
import { toErrorOutput, toNodeError } from '../../helpers/errorOutput';

export const properties: INodeProperties[] = [
	{
		displayName: 'State',
		name: 'state',
		type: 'options',
		default: 'LockedOut',
		required: true,
		description: 'The account condition to search for',
		options: [
			{ name: 'Disabled', value: 'Disabled', description: 'Administratively disabled accounts' },
			{ name: 'Enabled', value: 'Enabled', description: 'Accounts that are not disabled' },
			{ name: 'Expired', value: 'Expired', description: 'Accounts past their expiry date' },
			{
				name: 'Inactive',
				value: 'Inactive',
				description: 'Accounts that have not logged on recently. Approximate: AD refreshes lastLogonTimestamp only every 14 days.',
			},
			{
				name: 'Locked Out',
				value: 'LockedOut',
				description: 'Currently locked out, derived from lockoutTime',
			},
			{
				name: 'Password Expired',
				value: 'PasswordExpired',
				description: 'Password has passed its expiry under the effective policy',
			},
			{
				name: 'Password Must Change',
				value: 'PasswordMustChange',
				description: 'Must change password at next logon',
			},
			{
				name: 'Password Never Expires',
				value: 'PasswordNeverExpires',
				description: 'Password is flagged never to expire',
			},
			{
				name: 'Password Not Required',
				value: 'PasswordNotRequired',
				description: 'No password is required — a weak-configuration finding',
			},
		],
	},
	{
		displayName: 'Inactive Days',
		name: 'inactiveDays',
		type: 'number',
		default: 90,
		typeOptions: { minValue: 15 },
		displayOptions: { show: { state: ['Inactive'] } },
		description: 'Days of inactivity. Minimum 15, because AD refreshes lastLogonTimestamp only every 14 days by default.',
	},
	{
		displayName: 'Base DN',
		name: 'baseDn',
		type: 'string',
		default: '',
		description: 'Base DN to search from. Leave empty to search the whole domain.',
	},
	{
		displayName: 'Additional LDAP Filter',
		name: 'ldapFilter',
		type: 'string',
		default: '',
		description: 'An LDAP filter to intersect with the state condition, e.g. (department=Sales)',
	},
	{
		displayName: 'Return All',
		name: 'returnAll',
		type: 'boolean',
		default: false,
		description: 'Whether to return all results or only up to a given limit',
	},
	{
		displayName: 'Limit',
		name: 'limit',
		type: 'number',
		typeOptions: { minValue: 1 },
		displayOptions: { show: { returnAll: [false] } },
		default: 50,
		description: 'Max number of results to return',
	},
];

const displayOptions = {
	show: {
		resource: ['user'],
		operation: ['searchByState'],
	},
};

export const description = updateDisplayOptions(displayOptions, properties);

// The API clamps page size to 1000.
const MAX_PAGE_SIZE = 1000;

export async function execute(this: IExecuteFunctions): Promise<INodeExecutionData[]> {
	const items = this.getInputData();
	const returnData: INodeExecutionData[] = [];

	for (let i = 0; i < items.length; i++) {
		const state = this.getNodeParameter('state', i) as string;
		const baseDn = this.getNodeParameter('baseDn', i, '') as string;
		const ldapFilter = this.getNodeParameter('ldapFilter', i, '') as string;
		const returnAll = this.getNodeParameter('returnAll', i, false) as boolean;
		const limit = returnAll ? Number.MAX_SAFE_INTEGER : (this.getNodeParameter('limit', i, 50) as number);
		const inactiveDays =
			state === 'Inactive' ? (this.getNodeParameter('inactiveDays', i, 90) as number) : undefined;

		try {
			const rows: IDataObject[] = [];
			let continuationToken: string | undefined;

			// Page until the requested count is reached or the API stops handing back a token.
			do {
				// Built as a qs object rather than a URL string: the transport takes qs as its third
				// argument (query string before body) and handles encoding, so nothing here needs
				// escaping — an LDAP filter is full of characters that would otherwise need it.
				const qs: IDataObject = {
					state,
					pageSize: Math.min(MAX_PAGE_SIZE, limit - rows.length),
				};
				if (inactiveDays !== undefined) qs['inactiveDays'] = inactiveDays;
				if (baseDn) qs['baseDn'] = baseDn;
				if (ldapFilter) qs['ldapFilter'] = ldapFilter;
				if (continuationToken) qs['continuationToken'] = continuationToken;

				const response = (await activeDirectoryApiRequest.call(
					this,
					'GET',
					'/ad/accounts/search',
					qs,
					undefined,
				)) as { items?: IDataObject[]; continuationToken?: string } | undefined;

				rows.push(...(response?.items ?? []));
				continuationToken = response?.continuationToken || undefined;
			} while (continuationToken && rows.length < limit);

			const executionData = this.helpers.constructExecutionMetaData(
				this.helpers.returnJsonArray(rows.slice(0, limit)),
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
