import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Every write operation against an approval-gated 202.
 *
 * With "On Approval Required = Continue" the transport does not throw on a 202: it returns the
 * approval-pending item instead of the API's response. The change has not been made, so an operation
 * that discards that value and emits `{ success: true }` tells the workflow a queued delete or disable
 * is done — and the workflow never routes it to "Wait for Approval".
 *
 * This test enumerates every operation the node exports, runs each against a transport that answers
 * every non-GET with the pending item, and requires each write to emit that item unchanged. Nothing is
 * listed by hand: an operation added later is swept in automatically, and one that ignores the
 * transport result fails here.
 */

const GUID = '3f2504e0-4f89-11d3-9a0c-0305e82c3301';
const OPERATION_ID = '9e3a7c1d-2b4f-4c8e-a1d0-5f6b7c8d9e01';

const pending = {
	approvalRequired: true as const,
	operationId: OPERATION_ID,
	code: 'Operation.ApprovalRequired',
	status: 'WaitingToApprove',
	message: 'The operation requires approval.',
};

const calls: Array<{ method: string; endpoint: string }> = [];

vi.mock('../nodes/SynergyManagementGateway/transport/synergyManagementGatewayApiRequest', () => ({
	synergyManagementGatewayApiRequest: vi.fn(async (method: string, endpoint: string) => {
		calls.push({ method, endpoint });
		if (method !== 'GET') {
			return { ...pending };
		}
		// A read answer generic enough for every read operation to finish: an empty page, a decided
		// operation (for Wait for Approval) and an empty saved filter.
		return { id: GUID, status: 'Success', items: [], totalCount: 0, attributes: [] };
	}),
}));

import * as object from '../nodes/SynergyManagementGateway/actions/object';
import * as user from '../nodes/SynergyManagementGateway/actions/user';
import * as group from '../nodes/SynergyManagementGateway/actions/group';
import * as computer from '../nodes/SynergyManagementGateway/actions/computer';
import * as organizationalUnit from '../nodes/SynergyManagementGateway/actions/organizationalUnit';
import * as directoryContext from '../nodes/SynergyManagementGateway/actions/directoryContext';
import * as operationResource from '../nodes/SynergyManagementGateway/actions/operation';
import * as security from '../nodes/SynergyManagementGateway/actions/security';
import * as serviceAccount from '../nodes/SynergyManagementGateway/actions/serviceAccount';
import { isApprovalPending } from '../nodes/SynergyManagementGateway/transport/approvalPending';

type OperationModule = {
	execute: (...args: unknown[]) => Promise<Array<{ json: Record<string, unknown> }>>;
	description?: Array<{ name: string; default?: unknown; type?: string }>;
};

const resources: Record<string, Record<string, unknown>> = {
	object,
	user,
	group,
	computer,
	organizationalUnit,
	directoryContext,
	operation: operationResource,
	security,
	serviceAccount,
};

/**
 * Parameter values that let each operation reach the transport. Ids are GUIDs (the request path refuses
 * anything else); everything else falls back to the property's declared default, then to these.
 */
const overrides: Record<string, unknown> = {
	name: 'test',
	newName: 'renamed',
	newObjectName: 'renamed',
	newParentDistinguishedName: 'OU=Target,DC=example,DC=com',
	path: 'OU=Test,DC=example,DC=com',
	newPassword: 'N3w-Passw0rd!',
	oldPassword: 'Old-Passw0rd!',
	template: 'reset-password',
	trusteeBy: 'objectId',
	trusteeObjectId: GUID,
	trusteeSid: 'S-1-5-21-1111111111-2222222222-3333333333-1108',
	objectClass: 'user',
	expiresAt: '2030-01-01T00:00:00Z',
	expirationAction: 'set',
	servicePrincipalNames: 'HTTP/host.example.com',
	memberIds: GUID,
	groupIds: GUID,
	members: GUID,
	groups: GUID,
	principalObjectIds: GUID,
	timeout: 1,
	pollInterval: 5,
	returnAll: false,
	limit: 1,
	id: GUID,
};

function makeContext(module: OperationModule) {
	const declared = new Map((module.description ?? []).map((p) => [p.name, p.default]));

	return {
		getInputData: () => [{ json: { groups: [{ id: GUID }], members: [{ id: GUID }] } }],
		getNodeParameter: (name: string, _i: number, fallback?: unknown) => {
			if (name in overrides) return overrides[name];
			if (/Id$/.test(name)) return GUID;
			if (name === 'options') return { onApprovalRequired: 'continue' };
			if (/[Aa]ttributes$/.test(name)) {
				// One attribute, so an update that skips an empty change still sends a request.
				return {
					value: { description: 'x' },
					schema: [{ id: 'description', displayName: 'description [String]', required: false }],
				};
			}
			if (declared.has(name)) {
				const value = declared.get(name);
				return value === '' ? 'x' : value;
			}
			return fallback ?? {};
		},
		continueOnFail: () => false,
		getNode: () => ({ name: 'ActiveDirectory' }),
		helpers: {
			returnJsonArray: (data: unknown) => (Array.isArray(data) ? data : [data]).map((json) => ({ json })),
			constructExecutionMetaData: (data: unknown[]) => data,
		},
	};
}

const operations = Object.entries(resources).flatMap(([resource, mod]) =>
	Object.entries(mod)
		.filter(([name, value]) => name !== 'description' && typeof (value as OperationModule)?.execute === 'function')
		.map(([name, value]) => ({ id: `${resource}/${name}`, module: value as OperationModule })),
);

const seenWrites = new Set<string>();

const knownWrites = [
	'computer/create', 'computer/deleteById', 'computer/disable', 'computer/enable',
	'computer/resetPassword', 'computer/update',
	'group/assignMember', 'group/assignMembers', 'group/clearMembers', 'group/create',
	'group/deleteById', 'group/unassignMember', 'group/unassignMembers', 'group/update',
	'object/create', 'object/deleteById', 'object/move', 'object/rename', 'object/update',
	'organizationalUnit/create', 'organizationalUnit/deleteById', 'organizationalUnit/disableAccounts',
	'organizationalUnit/enableAccounts', 'organizationalUnit/update',
	'security/applyDelegation', 'security/revokeDelegation', 'security/setDeletionProtection',
	'security/setSpns',
	'serviceAccount/create', 'serviceAccount/deleteById', 'serviceAccount/setComputerLink',
	'serviceAccount/setPasswordRetrievalPrincipals', 'serviceAccount/update',
	'user/assignGroup', 'user/assignGroups', 'user/changePassword', 'user/clearGroups',
	'user/create', 'user/deleteById', 'user/disable', 'user/enable', 'user/resetPassword',
	'user/setAccountExpiration', 'user/unassignGroup', 'user/unassignGroups', 'user/unlock',
	'user/update',
].sort();

beforeEach(() => {
	calls.length = 0;
});

describe('write operations under an approval gate', () => {
	it('finds the operations to test', () => {
		// Guards the enumeration itself: if the barrel exports changed shape, the table below would
		// silently test nothing.
		expect(operations.length).toBeGreaterThan(80);
	});

	it.each(operations.map((o) => [o.id, o.module] as const))(
		'%s emits the approval-pending item, never success, when a write is queued',
		async (id, module) => {
			const result = await module.execute.call(makeContext(module) as never);

			// Every operation must reach the transport with these parameters; one that does not is
			// untested here, so it fails rather than passing vacuously.
			expect(calls.length, `${id} never called the transport`).toBeGreaterThan(0);

			const writes = calls.filter((c) => c.method !== 'GET');
			if (writes.length === 0) {
				return; // a read: never approval-gated
			}
			seenWrites.add(id);

			expect(result.length, `${id} emitted no item`).toBeGreaterThan(0);
			for (const item of result) {
				expect(isApprovalPending(item.json), `${id} did not emit the pending item`).toBe(true);
				expect(item.json.operationId).toBe(OPERATION_ID);
				expect(item.json, `${id} reported success for a queued change`).not.toHaveProperty('success');
			}
		},
		30000,
	);

	it('classified every known write operation as a write', () => {
		// The sweep decides "write" from the method the operation sent. If a fixture change made a write
		// stop reaching the transport, or one started sending GET, it would drop out of the checks above
		// without failing them; this keeps the known set covered. New writes join automatically.
		expect([...seenWrites].sort()).toEqual(expect.arrayContaining(knownWrites));
	});
});

describe('request paths', () => {
	it('every interpolated operation path is built with apiPath', () => {
		// A template literal path with an interpolation that bypasses apiPath interpolates an unchecked
		// id: an extra segment or an encoded `..` would retarget the call.
		const root = join(__dirname, '../nodes/SynergyManagementGateway');
		const offenders: string[] = [];

		const walk = (dir: string) => {
			for (const entry of readdirSync(dir, { withFileTypes: true })) {
				const full = join(dir, entry.name);
				if (entry.isDirectory()) walk(full);
				else if (entry.name.endsWith('.ts')) {
					const source = readFileSync(full, 'utf8');
					const bare = source.match(/(?<!apiPath)`\/(ad|operations|saved-ldap-filters)\/[^`]*\$\{[^`]*`/g);
					if (bare) offenders.push(`${full}: ${bare.join(', ')}`);
				}
			}
		};
		walk(root);

		expect(offenders).toEqual([]);
	});
});
