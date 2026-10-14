import {
	type IDataObject,
	type IExecuteFunctions,
	type INodeExecutionData,
	type INodeProperties,
	updateDisplayOptions,
} from 'n8n-workflow';

import { activeDirectoryApiRequest } from '../../transport/activeDirectoryApiRequest';
import { toWriteResult } from '../../helpers/writeResult';
import { toErrorOutput, toNodeError } from '../../helpers/errorOutput';

// POST /ad/service-accounts — New-ADServiceAccount.
export const properties: INodeProperties[] = [
	{
		displayName: 'Name',
		name: 'name',
		type: 'string',
		default: '',
		required: true,
		description: 'Account name, max 15 characters. Its sAMAccountName is this plus a trailing "$", which is capped at 20.',
	},
	{
		displayName: 'Kind',
		name: 'kind',
		type: 'options',
		default: 'group',
		required: true,
		description:
			'The consequential choice, and it CANNOT be changed later. A standalone account’s password is rotated by the single machine it is installed on, so it cannot be shared; a service running on more than one host needs a group account. Changing your mind means deleting and recreating',
		options: [
			{
				name: 'Group Managed (gMSA)',
				value: 'group',
				description: 'Password rotated by the domain controllers and retrievable by the hosts you name. Needed for a service on more than one machine.',
			},
			{
				name: 'Standalone (MSA)',
				value: 'standalone',
				description: 'Password rotated by the one machine it is installed on. Cannot be shared between hosts.',
			},
		],
	},
	{
		// Named without "password" on purpose. The lint autofixer treats any field whose name contains it as
		// a secret and adds typeOptions.password, which would mask these object GUIDs — unusable, since the
		// author cannot then see what they pasted, and misleading, since a GUID is not a credential.
		displayName: 'Retrieval Principal IDs',
		name: 'retrievalPrincipalObjectIds',
		type: 'string',
		default: '',
		displayOptions: { show: { kind: ['group'] } },
		description:
			'Comma-separated object GUIDs of the hosts or the group allowed to retrieve the managed password. Leave empty and the account is inert: nothing can obtain its password, so no service can authenticate as it. Normally the computer accounts or a group containing them',
	},
	{
		displayName: 'Additional Fields',
		name: 'additionalFields',
		type: 'collection',
		placeholder: 'Add Field',
		default: {},
		options: [
			{
				displayName: 'Description',
				name: 'description',
				type: 'string',
				default: '',
				description: 'Free-text description',
			},
			{
				displayName: 'DNS Host Name',
				name: 'dnsHostName',
				type: 'string',
				default: '',
				description: 'DNS host name the service is reached at. A group account needs this to be usable.',
			},
			{
				displayName: 'Managed Password Interval (Days)',
				name: 'managedPasswordIntervalDays',
				type: 'number',
				default: 30,
				description: 'Rotation interval for a group account. Defaults to 30 and is IMMUTABLE — Active Directory fixes it at creation and ignores later writes, so a different interval means a new account.',
			},
			{
				displayName: 'Path',
				name: 'path',
				type: 'string',
				default: '',
				description: 'Parent container DN. Defaults to the domain’s Managed Service Accounts container, which is where the PowerShell module puts them and therefore where an administrator will look.',
			},
			{
				displayName: 'SAM Account Name',
				name: 'samAccountName',
				type: 'string',
				default: '',
				description: 'Defaults to the name. A trailing "$" is appended automatically if absent.',
			},
			{
				displayName: 'Service Principal Names',
				name: 'servicePrincipalNames',
				type: 'string',
				default: '',
				description: 'Comma-separated SPNs to register on the account',
			},
		],
	},
];

const displayOptions = {
	show: {
		resource: ['serviceAccount'],
		operation: ['create'],
	},
};

export const description = updateDisplayOptions(displayOptions, properties);

/** Splits a comma-separated field, dropping blanks. */
function splitList(raw: string | undefined): string[] {
	return (raw ?? '')
		.split(',')
		.map((s) => s.trim())
		.filter((s) => s.length > 0);
}

export async function execute(this: IExecuteFunctions): Promise<INodeExecutionData[]> {
	const items = this.getInputData();
	const returnData: INodeExecutionData[] = [];

	for (let i = 0; i < items.length; i++) {
		const name = this.getNodeParameter('name', i) as string;
		const kind = this.getNodeParameter('kind', i) as string;
		const additional = this.getNodeParameter('additionalFields', i, {}) as IDataObject;

		const body: IDataObject = { name, kind };

		if (additional['description']) body['description'] = additional['description'];
		if (additional['dnsHostName']) body['dnsHostName'] = additional['dnsHostName'];
		if (additional['path']) body['path'] = additional['path'];
		if (additional['samAccountName']) body['samAccountName'] = additional['samAccountName'];

		const spns = splitList(additional['servicePrincipalNames'] as string | undefined);
		if (spns.length > 0) body['servicePrincipalNames'] = spns;

		// Only sent for a group account. The API rejects it for a standalone one rather than accepting it
		// and writing nothing, so passing it through unconditionally would turn a UI default into a 400.
		if (kind === 'group' && additional['managedPasswordIntervalDays'] !== undefined) {
			body['managedPasswordIntervalDays'] = additional['managedPasswordIntervalDays'];
		}

		if (kind === 'group') {
			// UI field is retrievalPrincipalObjectIds; the API body key keeps the fuller name.
			const principalIds = splitList(
				this.getNodeParameter('retrievalPrincipalObjectIds', i, '') as string,
			);
			if (principalIds.length > 0) body['passwordRetrievalPrincipalObjectIds'] = principalIds;
		}

		try {
			const response = (await activeDirectoryApiRequest.call(
				this,
				'POST',
				'/ad/service-accounts',
				undefined,
				body,
			)) as IDataObject | undefined;

			// isUnusable is forwarded rather than reduced to success: a group account created with no
			// retrieval principals exists and is enabled while nothing can authenticate as it, so a workflow
			// needs to be able to branch on that.
			returnData.push({
				json: toWriteResult(response, { success: true, ...response }),
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
