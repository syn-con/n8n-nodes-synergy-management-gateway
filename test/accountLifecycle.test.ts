import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../nodes/SynergyManagementGateway/transport/synergyManagementGatewayApiRequest', () => ({
	synergyManagementGatewayApiRequest: vi.fn().mockResolvedValue({}),
}));

import { synergyManagementGatewayApiRequest } from '../nodes/SynergyManagementGateway/transport/synergyManagementGatewayApiRequest';
import * as userUnlock from '../nodes/SynergyManagementGateway/actions/user/unlock.operation';
import * as userSearchByState from '../nodes/SynergyManagementGateway/actions/user/searchByState.operation';
import * as userGetGroups from '../nodes/SynergyManagementGateway/actions/user/getGroups.operation';
import * as groupGetMembers from '../nodes/SynergyManagementGateway/actions/group/getMembers.operation';
import * as objectMove from '../nodes/SynergyManagementGateway/actions/object/move.operation';
import * as objectRename from '../nodes/SynergyManagementGateway/actions/object/rename.operation';

const transport = vi.mocked(synergyManagementGatewayApiRequest);

function makeContext(params: Record<string, unknown>, continueOnFail = false) {
	return {
		getInputData: () => [{ json: {} }],
		getNodeParameter: (name: string, _i: number, fallback?: unknown) =>
			name in params ? params[name] : fallback,
		continueOnFail: () => continueOnFail,
		getNode: () => ({ name: 'ActiveDirectory' }),
		helpers: {
			returnJsonArray: (data: unknown[]) => data.map((json) => ({ json })),
			constructExecutionMetaData: (data: unknown[]) => data,
		},
	};
}

beforeEach(() => {
	transport.mockClear();
	transport.mockResolvedValue({});
});

describe('user/unlock', () => {
	const userId = '11111111-1111-1111-1111-111111111111';

	it('POSTs to the unlock route', async () => {
		await userUnlock.execute.call(makeContext({ userId }) as never);

		const [method, path] = transport.mock.calls[0];
		expect(method).toBe('POST');
		expect(path).toBe(`/ad/users/${userId}/unlock`);
	});

	it('forwards wasLocked so a workflow can branch on it', async () => {
		// The operation is idempotent, so success alone does not mean the account had been locked.
		transport.mockResolvedValue({ userId, wasLocked: true } as never);

		const result = await userUnlock.execute.call(makeContext({ userId }) as never);

		expect((result[0] as { json: { wasLocked: unknown } }).json.wasLocked).toBe(true);
	});

	it('reports wasLocked false when the account was already unlocked', async () => {
		transport.mockResolvedValue({ userId, wasLocked: false } as never);

		const result = await userUnlock.execute.call(makeContext({ userId }) as never);

		expect((result[0] as { json: { wasLocked: unknown } }).json.wasLocked).toBe(false);
	});

	it('captures the error as an item when continueOnFail is set', async () => {
		transport.mockRejectedValue(new Error('404 Not Found'));

		const result = await userUnlock.execute.call(makeContext({ userId }, true) as never);

		expect((result[0] as { json: { error: string } }).json.error).toBe('404 Not Found');
	});
});

describe('user/searchByState', () => {
	// The transport takes qs as its third argument and does the encoding, so these assert on the qs
	// object rather than a hand-built URL — an LDAP filter passed through a URL string would need
	// escaping the operation must not be doing itself.
	const qsOf = (call: number) => transport.mock.calls[call][2] as Record<string, unknown>;

	it('GETs the account search route with the state in qs', async () => {
		transport.mockResolvedValue({ items: [] } as never);

		await userSearchByState.execute.call(
			makeContext({ state: 'LockedOut', returnAll: false, limit: 50 }) as never,
		);

		const [method, path] = transport.mock.calls[0];
		expect(method).toBe('GET');
		expect(path).toBe('/ad/accounts/search');
		expect(qsOf(0)['state']).toBe('LockedOut');
	});

	it('sends inactiveDays only for the Inactive state', async () => {
		transport.mockResolvedValue({ items: [] } as never);

		await userSearchByState.execute.call(
			makeContext({ state: 'Inactive', inactiveDays: 120, returnAll: false, limit: 50 }) as never,
		);
		expect(qsOf(0)['inactiveDays']).toBe(120);

		transport.mockClear();
		await userSearchByState.execute.call(
			makeContext({ state: 'Disabled', inactiveDays: 120, returnAll: false, limit: 50 }) as never,
		);
		// Sending it for other states would imply it has an effect, which it does not.
		expect(qsOf(0)).not.toHaveProperty('inactiveDays');
	});

	it('omits empty optional parameters instead of sending blanks', async () => {
		transport.mockResolvedValue({ items: [] } as never);

		await userSearchByState.execute.call(
			makeContext({ state: 'Disabled', baseDn: '', ldapFilter: '', returnAll: false, limit: 50 }) as never,
		);

		expect(qsOf(0)).not.toHaveProperty('baseDn');
		expect(qsOf(0)).not.toHaveProperty('ldapFilter');
	});

	it('passes an LDAP filter through qs unescaped', async () => {
		transport.mockResolvedValue({ items: [] } as never);

		await userSearchByState.execute.call(
			makeContext({
				state: 'Disabled',
				ldapFilter: '(department=Sales & Marketing)',
				returnAll: false,
				limit: 50,
			}) as never,
		);

		// Encoding is the transport's job; the value must arrive verbatim.
		expect(qsOf(0)['ldapFilter']).toBe('(department=Sales & Marketing)');
	});

	it('follows the continuation token until the limit is reached', async () => {
		transport
			.mockResolvedValueOnce({ items: [{ samAccountName: 'a' }], continuationToken: 'tok' } as never)
			.mockResolvedValueOnce({ items: [{ samAccountName: 'b' }], continuationToken: '' } as never);

		const result = await userSearchByState.execute.call(
			makeContext({ state: 'LockedOut', returnAll: true }) as never,
		);

		expect(transport).toHaveBeenCalledTimes(2);
		expect(qsOf(1)['continuationToken']).toBe('tok');
		expect(result).toHaveLength(2);
	});

	it('stops at the limit even when more pages remain', async () => {
		transport.mockResolvedValue({
			items: [{ samAccountName: 'a' }, { samAccountName: 'b' }, { samAccountName: 'c' }],
			continuationToken: 'more',
		} as never);

		const result = await userSearchByState.execute.call(
			makeContext({ state: 'LockedOut', returnAll: false, limit: 2 }) as never,
		);

		expect(result).toHaveLength(2);
	});

	it('returns nothing when no account matches', async () => {
		transport.mockResolvedValue({ items: [] } as never);

		const result = await userSearchByState.execute.call(
			makeContext({ state: 'LockedOut', returnAll: false, limit: 50 }) as never,
		);

		expect(result).toHaveLength(0);
	});
});

describe('recursive membership', () => {
	const userId = '11111111-1111-1111-1111-111111111111';
	const groupId = '22222222-2222-2222-2222-222222222222';

	it('user/getGroups omits qs entirely by default', async () => {
		transport.mockResolvedValue([] as never);

		await userGetGroups.execute.call(makeContext({ userId, recursive: false }) as never);

		// Omitted rather than recursive=false, so the API default governs.
		expect(transport.mock.calls[0][1]).toBe(`/ad/users/${userId}/groups`);
		expect(transport.mock.calls[0][2]).toBeUndefined();
	});

	it('user/getGroups requests recursive via qs when enabled', async () => {
		transport.mockResolvedValue([] as never);

		await userGetGroups.execute.call(makeContext({ userId, recursive: true }) as never);

		expect(transport.mock.calls[0][1]).toBe(`/ad/users/${userId}/groups`);
		expect(transport.mock.calls[0][2]).toEqual({ recursive: true });
	});

	it('group/getMembers omits qs entirely by default', async () => {
		transport.mockResolvedValue([] as never);

		await groupGetMembers.execute.call(makeContext({ groupId, recursive: false }) as never);

		expect(transport.mock.calls[0][1]).toBe(`/ad/groups/${groupId}/members`);
		expect(transport.mock.calls[0][2]).toBeUndefined();
	});

	it('group/getMembers requests recursive via qs when enabled', async () => {
		transport.mockResolvedValue([] as never);

		await groupGetMembers.execute.call(makeContext({ groupId, recursive: true }) as never);

		expect(transport.mock.calls[0][1]).toBe(`/ad/groups/${groupId}/members`);
		expect(transport.mock.calls[0][2]).toEqual({ recursive: true });
	});

	it('group/getMembers treats an empty 204 body as no members', async () => {
		transport.mockResolvedValue(undefined as never);

		const result = await groupGetMembers.execute.call(
			makeContext({ groupId, recursive: false }) as never,
		);

		expect(result).toHaveLength(0);
	});
});

describe('object move/rename class assertion', () => {
	const objectId = '33333333-3333-3333-3333-333333333333';

	it('move uses the generic route when no class is expected', async () => {
		await objectMove.execute.call(
			makeContext({ objectId, newParentDistinguishedName: 'OU=Leavers,DC=x,DC=y', expectedClass: '' }) as never,
		);

		expect(transport.mock.calls[0][1]).toBe(`/ad/objects/${objectId}/move`);
	});

	it.each([
		['user', 'users'],
		['group', 'groups'],
		['computer', 'computers'],
		['organizationalUnit', 'organization-units'],
	])('move routes %s to the typed %s endpoint', async (expectedClass, segment) => {
		// The typed route is what performs the class assertion; the generic one does not check.
		await objectMove.execute.call(
			makeContext({ objectId, newParentDistinguishedName: 'OU=Leavers,DC=x,DC=y', expectedClass }) as never,
		);

		expect(transport.mock.calls[0][1]).toBe(`/ad/${segment}/${objectId}/move`);
	});

	it('move falls back to the generic route for a class with no typed endpoint', async () => {
		// A class assertion is a safety improvement, not a requirement — an unmapped class must still work.
		await objectMove.execute.call(
			makeContext({ objectId, newParentDistinguishedName: 'OU=x,DC=y', expectedClass: 'contact' }) as never,
		);

		expect(transport.mock.calls[0][1]).toBe(`/ad/objects/${objectId}/move`);
	});

	it('rename uses the generic route when no class is expected', async () => {
		await objectRename.execute.call(
			makeContext({ objectId, newObjectName: 'New Name', expectedClass: '' }) as never,
		);

		expect(transport.mock.calls[0][1]).toBe(`/ad/objects/${objectId}/rename`);
	});

	it('rename routes a user to the typed endpoint', async () => {
		await objectRename.execute.call(
			makeContext({ objectId, newObjectName: 'New Name', expectedClass: 'user' }) as never,
		);

		expect(transport.mock.calls[0][1]).toBe(`/ad/users/${objectId}/rename`);
	});

	it('rename sends the new name in the body, not the query string', async () => {
		await objectRename.execute.call(
			makeContext({ objectId, newObjectName: 'New Name', expectedClass: 'user' }) as never,
		);

		// qs is the third argument, body the fourth — swapping them is not caught by the compiler.
		expect(transport.mock.calls[0][2]).toBeUndefined();
		expect(transport.mock.calls[0][3]).toEqual({ newName: 'New Name' });
	});
});
