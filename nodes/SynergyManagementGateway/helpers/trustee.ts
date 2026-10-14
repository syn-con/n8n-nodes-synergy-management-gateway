import { NodeOperationError, type IExecuteFunctions, type INodeProperties } from 'n8n-workflow';

/**
 * The trustee fields shared by the delegation operations.
 *
 * A trustee is named by SID or by object GUID, never by name. The API refuses a name for a reason worth
 * repeating here: names are ambiguous across a forest, and a mis-resolved trustee on a permission grant
 * is a security defect rather than an inconvenience. The object-GUID form is the convenient one in a
 * workflow, because a preceding Get Many Groups node already produced it.
 */
export const trusteeProperties: INodeProperties[] = [
	{
		displayName: 'Trustee By',
		name: 'trusteeBy',
		type: 'options',
		default: 'objectId',
		description: 'How the principal receiving the delegation is identified',
		options: [
			{
				name: 'Object ID',
				value: 'objectId',
				description: 'The object GUID of a group or user, as returned by a Get Many operation',
			},
			{
				name: 'SID',
				value: 'sid',
				description: 'A security identifier. Required for well-known principals such as Everyone (S-1-1-0), which have no directory object.',
			},
		],
	},
	{
		displayName: 'Trustee Object ID',
		name: 'trusteeObjectId',
		type: 'string',
		default: '',
		required: true,
		displayOptions: { show: { trusteeBy: ['objectId'] } },
		description: 'The object GUID of the principal. Prefer a group: a group membership can be changed without touching a single ACL, whereas a delegation written to an individual has to be found and revoked on every container it was applied to.',
	},
	{
		displayName: 'Trustee SID',
		name: 'trusteeSid',
		type: 'string',
		default: '',
		required: true,
		displayOptions: { show: { trusteeBy: ['sid'] } },
		description: 'The security identifier of the principal, for example S-1-5-21-…-1108',
	},
];

/**
 * Reads the trustee fields into the exactly-one-of shape the API requires.
 *
 * The empty check happens here rather than being left to the API so a blank expression — the usual cause,
 * when an upstream node produced nothing — fails with a message naming the field instead of a 400 about a
 * trustee the workflow author never typed.
 */
export function readTrustee(
	context: IExecuteFunctions,
	itemIndex: number,
): { trusteeSid?: string; trusteeObjectId?: string } {
	const trusteeBy = context.getNodeParameter('trusteeBy', itemIndex) as string;

	if (trusteeBy === 'sid') {
		const sid = (context.getNodeParameter('trusteeSid', itemIndex) as string)?.trim();
		if (!sid) {
			throw new NodeOperationError(context.getNode(), 'Trustee SID is required', {
				itemIndex,
			});
		}
		return { trusteeSid: sid };
	}

	const objectId = (context.getNodeParameter('trusteeObjectId', itemIndex) as string)?.trim();
	if (!objectId) {
		throw new NodeOperationError(context.getNode(), 'Trustee Object ID is required', {
			itemIndex,
		});
	}
	return { trusteeObjectId: objectId };
}

/**
 * The delegation-template dropdown.
 *
 * Hard-coded rather than loaded from `GET /ad/delegation-templates`, because a `loadOptions` method needs
 * working credentials before the node can be configured at all — and the catalogue is fixed, so the cost
 * of that round trip buys nothing. The descriptions are condensed from the API's; read the endpoint for
 * the full text before granting one.
 */
export const delegationTemplateProperty: INodeProperties = {
	displayName: 'Template',
	name: 'template',
	type: 'options',
	default: 'reset-user-passwords',
	required: true,
	description:
		'Which delegation to apply. Each expands server-side to a fixed set of access-control entries. Use Get Many Delegation Templates to see exactly what each one grants',
	options: [
		{
			name: 'Create, Delete and Manage User Accounts',
			value: 'create-delete-users',
			description: 'Create and delete users in the container and fully manage the ones beneath it. Substantially wider than Reset User Passwords — full control of a user includes resetting its password and rewriting its permissions.',
		},
		{
			name: 'Full Control',
			value: 'full-control',
			description:
				'Complete control of the container and everything beneath it, including rewriting these permissions. Cannot be narrowed afterwards. On a container holding privileged accounts this is equivalent to domain administrator',
		},
		{
			name: 'Join a Computer to the Domain',
			value: 'join-computers-to-domain',
			description: 'Create computer objects in the container. Create-only: it confers no control over computers already there.',
		},
		{
			name: 'Modify the Membership of a Group',
			value: 'manage-group-membership',
			description: 'Add and remove members of groups beneath the container. Membership control over a privileged group is equivalent to holding that group’s privileges.',
		},
		{
			name: 'Read All Properties',
			value: 'read-all-properties',
			description: 'Read every attribute of the container and everything beneath it. Read-only, but discloses the full directory content in scope including the ACLs that reveal where privileges sit.',
		},
		{
			name: 'Reset User Passwords and Force Change at Next Logon',
			value: 'reset-user-passwords',
			description: 'Reset the password of any user beneath the container. Whoever holds it can set a password they know and then authenticate as that user, so grant it on the narrowest container that covers the help desk’s actual scope.',
		},
	],
};
