/**
 * Maps an AD object class to its typed REST route segment.
 *
 * The typed move and rename routes assert the target's object class before touching it, so a GUID
 * belonging to a different class is refused rather than silently moved or renamed. The generic
 * `/ad/objects/...` routes perform no such check.
 *
 * Returns null for a class with no typed route, in which case the caller should fall back to the
 * generic route rather than fail — the class assertion is a safety improvement, not a requirement.
 */
export function typedRouteSegmentFor(objectClass: string | undefined): string | null {
	if (!objectClass) return null;

	switch (objectClass) {
		case 'user':
			return 'users';
		case 'group':
			return 'groups';
		case 'computer':
			return 'computers';
		case 'organizationalUnit':
			return 'organization-units';
		default:
			return null;
	}
}

/**
 * The Expected Class dropdown shared by the object move and rename operations. Empty means "no check",
 * which routes to the generic endpoint.
 */
export const expectedClassProperty = {
	displayName: 'Expected Class',
	name: 'expectedClass',
	type: 'options' as const,
	default: '',
	description:
		'Optional safety check. When set, the operation is refused if the object ID belongs to a different class. Strongly recommended for moves, since a move changes the distinguished name and makes existing references stale.',
	options: [
		{ name: 'No Check', value: '', description: 'Do not verify the object class' },
		{ name: 'Computer', value: 'computer', description: 'Refuse unless the target is a computer' },
		{ name: 'Group', value: 'group', description: 'Refuse unless the target is a group' },
		{
			name: 'Organizational Unit',
			value: 'organizationalUnit',
			description: 'Refuse unless the target is an organizational unit',
		},
		{ name: 'User', value: 'user', description: 'Refuse unless the target is a user' },
	],
};
