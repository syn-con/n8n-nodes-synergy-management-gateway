import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Every operation under "Continue on Fail".
 *
 * A failed item must keep what the transport stamped on the error — the API's error code and, for an
 * approval gate answered with 202 in the default "error" mode, the operation id. An item that carries only
 * the message leaves the workflow unable to poll the queued change, and a retry branch keyed on the error
 * queues a second request for the approver. Each failed item must also stay paired with its input.
 *
 * Like the write sweep, nothing is listed by hand: every exported operation runs against a transport that
 * rejects every call, so an operation added later without `toErrorOutput` fails here.
 */

const GUID = '3f2504e0-4f89-11d3-9a0c-0305e82c3301';
const OPERATION_ID = '9e3a7c1d-2b4f-4c8e-a1d0-5f6b7c8d9e01';

let calls = 0;

vi.mock('../nodes/SynergyManagementGateway/transport/synergyManagementGatewayApiRequest', () => ({
	synergyManagementGatewayApiRequest: vi.fn(async () => {
		calls++;
		const error = new Error('The operation requires approval.') as Error & Record<string, unknown>;
		error.adErrorCode = 'Operation.ApprovalRequired';
		error.adHttpCode = '202';
		error.adApprovalRequired = true;
		error.adOperationId = OPERATION_ID;
		throw error;
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

type OperationModule = {
	execute: (...args: unknown[]) => Promise<Array<{ json: Record<string, unknown>; pairedItem?: unknown }>>;
	description?: Array<{ name: string; default?: unknown }>;
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

function makeContext(module: OperationModule, attributes: unknown) {
	const declared = new Map((module.description ?? []).map((p) => [p.name, p.default]));

	return {
		getInputData: () => [{ json: { groups: [{ id: GUID }], members: [{ id: GUID }] } }],
		getNodeParameter: (name: string, _i: number, fallback?: unknown) => {
			if (name in overrides) return overrides[name];
			if (/Id$/.test(name)) return GUID;
			if (name === 'options') return { onApprovalRequired: 'error' };
			if (/[Aa]ttributes$/.test(name)) return attributes;
			if (declared.has(name)) {
				const value = declared.get(name);
				return value === '' ? 'x' : value;
			}
			return fallback ?? {};
		},
		continueOnFail: () => true,
		getNode: () => ({ name: 'ActiveDirectory' }),
		helpers: {
			returnJsonArray: (data: unknown) => (Array.isArray(data) ? data : [data]).map((json) => ({ json })),
			constructExecutionMetaData: (data: unknown[]) => data,
		},
	};
}

const oneAttribute = {
	value: { description: 'x' },
	schema: [{ id: 'description', displayName: 'description [String]', required: false }],
};

const operations = Object.entries(resources).flatMap(([resource, mod]) =>
	Object.entries(mod)
		.filter(([name, value]) => name !== 'description' && typeof (value as OperationModule)?.execute === 'function')
		.map(([name, value]) => ({ id: `${resource}/${name}`, module: value as OperationModule })),
);

beforeEach(() => {
	calls = 0;
});

describe('Continue on Fail', () => {
	it('finds the operations to test', () => {
		expect(operations.length).toBeGreaterThan(80);
	});

	it.each(operations.map((o) => [o.id, o.module] as const))(
		'%s keeps the error code and operation id on the failed item',
		async (id, module) => {
			const result = await module.execute.call(makeContext(module, oneAttribute) as never);

			expect(calls, `${id} never called the transport`).toBeGreaterThan(0);
			expect(result.length, `${id} emitted no item`).toBeGreaterThan(0);
			for (const item of result) {
				expect(item.json.operationId, `${id} dropped the operation id`).toBe(OPERATION_ID);
				expect(item.json.errorCode, `${id} dropped the error code`).toBe('Operation.ApprovalRequired');
				expect(item.json.approvalRequired).toBe(true);
				expect(item.pairedItem, `${id} lost its pairing`).toEqual({ item: 0 });
			}
		},
		30000,
	);

	it.each(['user/update', 'group/update', 'computer/update'])(
		'%s reports an invalid attribute as the item\'s error instead of failing the node',
		async (id) => {
			const module = operations.find((o) => o.id === id)!.module;
			const invalid = { value: { nonsense: 'x' }, schema: [] };

			const result = await module.execute.call(makeContext(module, invalid) as never);

			expect(calls).toBe(0);
			expect(result).toHaveLength(1);
			expect(result[0].json.error).toEqual(expect.any(String));
			expect(result[0].pairedItem).toEqual({ item: 0 });
		},
	);

	it.each(['user/update', 'group/update', 'computer/update'])(
		'%s answers an item with nothing to change instead of dropping it',
		async (id) => {
			const module = operations.find((o) => o.id === id)!.module;
			const context = {
				...makeContext(module, { value: {}, schema: [] }),
				// Nothing set anywhere: no attributes, no rename, no account policy.
				getNodeParameter: (name: string, _i: number, fallback?: unknown) =>
					/Id$/.test(name) ? GUID : /[Aa]ttributes$/.test(name) ? { value: {}, schema: [] } : (fallback ?? ''),
			};

			const result = await module.execute.call(context as never);

			expect(calls).toBe(0);
			expect(result).toEqual([{ json: { success: true, changed: false, id: GUID }, pairedItem: { item: 0 } }]);
		},
	);
});
