import { describe, it, expect, vi, beforeEach } from 'vitest';

// The transport is mocked so each operation's method, path and body can be asserted exactly. For this
// resource that is the entire contract worth testing: a wrong path surfaces only as a 404 at runtime, and
// a wrong body on a delegation write means granting the wrong permission to the wrong principal — neither
// is something a workflow author would notice from the node's output.
vi.mock('../nodes/SynergyManagementGateway/transport/activeDirectoryApiRequest', () => ({
	activeDirectoryApiRequest: vi.fn().mockResolvedValue({ ok: true }),
}));

import { activeDirectoryApiRequest } from '../nodes/SynergyManagementGateway/transport/activeDirectoryApiRequest';
import * as security from '../nodes/SynergyManagementGateway/actions/security';
import { SynergyManagementGateway } from '../nodes/SynergyManagementGateway/SynergyManagementGateway.node';

const nodeDescription = new SynergyManagementGateway().description;

const transport = vi.mocked(activeDirectoryApiRequest);

const OBJECT_ID = '11111111-2222-3333-4444-555555555555';
const GROUP_ID = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
const SID = 'S-1-5-21-1111111111-2222222222-3333333333-1108';

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
	transport.mockResolvedValue({ ok: true });
});

describe('security resource registration', () => {
	it('is offered in the resource dropdown', () => {
		const resource = nodeDescription.properties.find((p) => p.name === 'resource');
		const values = (resource?.options ?? []).map((o) => (o as { value: string }).value);

		expect(values).toContain('security');
	});

	it('offers every exported operation in the dropdown', () => {
		// The router dispatches on the operation value, so an operation exported without a dropdown entry
		// is unreachable and one listed without an export throws at runtime.
		const operationProperty = nodeDescription.properties.find(
			(p) =>
				p.name === 'operation' &&
				(p.displayOptions?.show?.resource as string[] | undefined)?.includes('security'),
		);

		const listed = (operationProperty?.options ?? [])
			.map((o) => (o as { value: string }).value)
			.sort();

		const exported = Object.keys(security)
			.filter((k) => k !== 'description')
			.sort();

		expect(listed).toEqual(exported);
	});

	it('gives every operation an execute function', () => {
		for (const [name, module] of Object.entries(security)) {
			if (name === 'description') continue;
			expect(typeof (module as { execute?: unknown }).execute).toBe('function');
		}
	});
});

describe('ACL read', () => {
	it('GETs the object ACL', async () => {
		await security.getAcl.execute.call(makeContext({ objectId: OBJECT_ID }) as never);

		const [method, path] = transport.mock.calls[0];
		expect(method).toBe('GET');
		expect(path).toBe(`/ad/objects/${OBJECT_ID}/acl`);
	});

	it('returns every entry by default', async () => {
		transport.mockResolvedValue({
			accessControlEntries: [{ isInherited: true }, { isInherited: false }],
		} as never);

		const result = (await security.getAcl.execute.call(
			makeContext({ objectId: OBJECT_ID }) as never,
		)) as Array<{ json: { accessControlEntries: unknown[] } }>;

		expect(result[0].json.accessControlEntries).toHaveLength(2);
	});

	it('drops inherited entries when asked', async () => {
		transport.mockResolvedValue({
			accessControlEntries: [{ isInherited: true }, { isInherited: false }],
		} as never);

		const result = (await security.getAcl.execute.call(
			makeContext({ objectId: OBJECT_ID, explicitOnly: true }) as never,
		)) as Array<{ json: { accessControlEntries: Array<{ isInherited: boolean }> } }>;

		expect(result[0].json.accessControlEntries).toHaveLength(1);
		expect(result[0].json.accessControlEntries[0].isInherited).toBe(false);
	});

	it('treats a missing isInherited as explicit', async () => {
		// An entry the API did not mark as inherited must not be filtered out — silently hiding an
		// explicit entry from an audit is worse than showing one extra.
		transport.mockResolvedValue({ accessControlEntries: [{ trusteeSid: SID }] } as never);

		const result = (await security.getAcl.execute.call(
			makeContext({ objectId: OBJECT_ID, explicitOnly: true }) as never,
		)) as Array<{ json: { accessControlEntries: unknown[] } }>;

		expect(result[0].json.accessControlEntries).toHaveLength(1);
	});
});

describe('delegation reads', () => {
	it('GETs the static template catalogue', async () => {
		await security.listDelegationTemplates.execute.call(makeContext({}) as never);

		const [method, path] = transport.mock.calls[0];
		expect(method).toBe('GET');
		expect(path).toBe('/ad/delegation-templates');
	});

	it('GETs the delegations of an object', async () => {
		await security.getDelegations.execute.call(makeContext({ objectId: OBJECT_ID }) as never);

		const [method, path] = transport.mock.calls[0];
		expect(method).toBe('GET');
		expect(path).toBe(`/ad/objects/${OBJECT_ID}/delegations`);
	});

	it('reports incomplete delegations by default', async () => {
		// An incomplete match means the delegation was edited by hand or applied by another tool, which is
		// exactly the finding an audit is looking for — so it must not be filtered out unasked.
		transport.mockResolvedValue([{ isComplete: false }, { isComplete: true }] as never);

		const result = (await security.getDelegations.execute.call(
			makeContext({ objectId: OBJECT_ID }) as never,
		)) as unknown[];

		expect(result).toHaveLength(2);
	});

	it('filters to complete delegations when asked', async () => {
		transport.mockResolvedValue([{ isComplete: false }, { isComplete: true }] as never);

		const result = (await security.getDelegations.execute.call(
			makeContext({ objectId: OBJECT_ID, completeOnly: true }) as never,
		)) as Array<{ json: { isComplete: boolean } }>;

		expect(result).toHaveLength(1);
		expect(result[0].json.isComplete).toBe(true);
	});
});

describe('delegation writes', () => {
	it('POSTs the template and an object-GUID trustee', async () => {
		await security.applyDelegation.execute.call(
			makeContext({
				objectId: OBJECT_ID,
				template: 'reset-user-passwords',
				trusteeBy: 'objectId',
				trusteeObjectId: GROUP_ID,
			}) as never,
		);

		const [method, path, qs, body] = transport.mock.calls[0];
		expect(method).toBe('POST');
		expect(path).toBe(`/ad/objects/${OBJECT_ID}/delegations`);
		expect(qs).toBeUndefined();
		expect(body).toEqual({ template: 'reset-user-passwords', trusteeObjectId: GROUP_ID });
	});

	it('POSTs a SID trustee when that form is chosen', async () => {
		await security.applyDelegation.execute.call(
			makeContext({
				objectId: OBJECT_ID,
				template: 'full-control',
				trusteeBy: 'sid',
				trusteeSid: SID,
			}) as never,
		);

		expect(transport.mock.calls[0][3]).toEqual({ template: 'full-control', trusteeSid: SID });
	});

	it('never sends both trustee forms at once', async () => {
		// The API requires exactly one. Sending both would be rejected, and a precedence rule would mean
		// granting to whichever the server preferred.
		await security.applyDelegation.execute.call(
			makeContext({
				objectId: OBJECT_ID,
				template: 'full-control',
				trusteeBy: 'sid',
				trusteeSid: SID,
				trusteeObjectId: GROUP_ID,
			}) as never,
		);

		const body = transport.mock.calls[0][3] as Record<string, unknown>;
		expect(body).not.toHaveProperty('trusteeObjectId');
	});

	it('trims a trustee value', async () => {
		await security.applyDelegation.execute.call(
			makeContext({
				objectId: OBJECT_ID,
				template: 'full-control',
				trusteeBy: 'sid',
				trusteeSid: `  ${SID}  `,
			}) as never,
		);

		expect((transport.mock.calls[0][3] as Record<string, unknown>).trusteeSid).toBe(SID);
	});

	it('fails without calling the API when the trustee is blank', async () => {
		// The usual cause is an upstream node that produced nothing. Failing here names the field, whereas
		// letting it through produces a 400 about a trustee the author never typed.
		await expect(
			security.applyDelegation.execute.call(
				makeContext({
					objectId: OBJECT_ID,
					template: 'full-control',
					trusteeBy: 'objectId',
					trusteeObjectId: '   ',
				}) as never,
			),
		).rejects.toThrow(/Trustee Object ID is required/);

		expect(transport).not.toHaveBeenCalled();
	});

	it('DELETEs to revoke, with the same body shape', async () => {
		await security.revokeDelegation.execute.call(
			makeContext({
				objectId: OBJECT_ID,
				template: 'manage-group-membership',
				trusteeBy: 'objectId',
				trusteeObjectId: GROUP_ID,
			}) as never,
		);

		const [method, path, , body] = transport.mock.calls[0];
		expect(method).toBe('DELETE');
		expect(path).toBe(`/ad/objects/${OBJECT_ID}/delegations`);
		expect(body).toEqual({
			template: 'manage-group-membership',
			trusteeObjectId: GROUP_ID,
		});
	});

	it('forwards changed and warnings rather than reducing them to success', async () => {
		transport.mockResolvedValue({
			changed: false,
			warnings: ['Already fully applied'],
			entriesAdded: 0,
		} as never);

		const result = (await security.applyDelegation.execute.call(
			makeContext({
				objectId: OBJECT_ID,
				template: 'full-control',
				trusteeBy: 'sid',
				trusteeSid: SID,
			}) as never,
		)) as Array<{ json: Record<string, unknown> }>;

		expect(result[0].json.changed).toBe(false);
		expect(result[0].json.warnings).toEqual(['Already fully applied']);
	});

	it('offers only keys the API catalogue defines', () => {
		const template = security.applyDelegation.description.find((p) => p.name === 'template');
		const values = (template?.options ?? []).map((o) => (o as { value: string }).value).sort();

		expect(values).toEqual(
			[
				'create-delete-users',
				'full-control',
				'join-computers-to-domain',
				'manage-group-membership',
				'read-all-properties',
				'reset-user-passwords',
			].sort(),
		);
	});
});

describe('deletion protection', () => {
	it('PUTs the protect flag on the typed OU route', async () => {
		await security.setDeletionProtection.execute.call(
			makeContext({ objectId: OBJECT_ID, protect: true }) as never,
		);

		const [method, path, qs, body] = transport.mock.calls[0];
		expect(method).toBe('PUT');
		expect(path).toBe(`/ad/organization-units/${OBJECT_ID}/protect-from-deletion`);
		expect(qs).toBeUndefined();
		expect(body).toEqual({ protect: true });
	});

	it('sends false when unprotecting', async () => {
		await security.setDeletionProtection.execute.call(
			makeContext({ objectId: OBJECT_ID, protect: false }) as never,
		);

		expect(transport.mock.calls[0][3]).toEqual({ protect: false });
	});

	it('defaults to protecting rather than unprotecting', () => {
		// The dangerous direction must never be the default: unprotecting enables a tree deletion.
		const protectField = security.setDeletionProtection.description.find((p) => p.name === 'protect');
		expect(protectField?.default).toBe(true);
	});
});

describe('service principal names', () => {
	it('GETs the user route for a user', async () => {
		transport.mockResolvedValue([] as never);

		await security.getSpns.execute.call(
			makeContext({ objectClass: 'user', objectId: OBJECT_ID }) as never,
		);

		expect(transport.mock.calls[0][1]).toBe(`/ad/users/${OBJECT_ID}/spns`);
	});

	it('GETs the computer route for a computer', async () => {
		transport.mockResolvedValue([] as never);

		await security.getSpns.execute.call(
			makeContext({ objectClass: 'computer', objectId: OBJECT_ID }) as never,
		);

		expect(transport.mock.calls[0][1]).toBe(`/ad/computers/${OBJECT_ID}/spns`);
	});

	it('derives isKerberoastable from the presence of an SPN', async () => {
		transport.mockResolvedValue(['HTTP/web01.example.com'] as never);

		const withSpn = (await security.getSpns.execute.call(
			makeContext({ objectClass: 'user', objectId: OBJECT_ID }) as never,
		)) as Array<{ json: { isKerberoastable: boolean } }>;

		expect(withSpn[0].json.isKerberoastable).toBe(true);

		transport.mockResolvedValue([] as never);

		const withoutSpn = (await security.getSpns.execute.call(
			makeContext({ objectClass: 'user', objectId: OBJECT_ID }) as never,
		)) as Array<{ json: { isKerberoastable: boolean } }>;

		expect(withoutSpn[0].json.isKerberoastable).toBe(false);
	});

	it('splits a comma-separated SPN list into an array', async () => {
		// Sending the raw string would write one malformed SPN, which AD stores without complaint and then
		// never matches against a Kerberos ticket request.
		await security.setSpns.execute.call(
			makeContext({
				objectClass: 'computer',
				objectId: OBJECT_ID,
				servicePrincipalNames: 'HTTP/web01.example.com, MSSQLSvc/db01.example.com:1433',
			}) as never,
		);

		const [method, path, , body] = transport.mock.calls[0];
		expect(method).toBe('PUT');
		expect(path).toBe(`/ad/computers/${OBJECT_ID}/spns`);
		expect(body).toEqual({
			servicePrincipalNames: ['HTTP/web01.example.com', 'MSSQLSvc/db01.example.com:1433'],
		});
	});

	it('sends an empty array for a blank list, which removes every SPN', async () => {
		await security.setSpns.execute.call(
			makeContext({
				objectClass: 'user',
				objectId: OBJECT_ID,
				servicePrincipalNames: '  ,  ',
			}) as never,
		);

		expect(transport.mock.calls[0][3]).toEqual({ servicePrincipalNames: [] });
	});

	it('reports removedAll so a workflow can branch on it', async () => {
		const result = (await security.setSpns.execute.call(
			makeContext({
				objectClass: 'user',
				objectId: OBJECT_ID,
				servicePrincipalNames: '',
			}) as never,
		)) as Array<{ json: { removedAll: boolean } }>;

		expect(result[0].json.removedAll).toBe(true);
	});
});

describe('continueOnFail', () => {
	it('emits an error item rather than throwing, for every operation', async () => {
		transport.mockRejectedValue(new Error('403 Forbidden'));

		const params = {
			objectId: OBJECT_ID,
			template: 'full-control',
			trusteeBy: 'sid',
			trusteeSid: SID,
			objectClass: 'user',
			protect: true,
			servicePrincipalNames: 'HTTP/a',
		};

		for (const [name, module] of Object.entries(security)) {
			if (name === 'description') continue;

			const result = (await (module as { execute: (...a: unknown[]) => Promise<unknown> }).execute.call(
				makeContext(params, true) as never,
			)) as Array<{ json: { error?: string } }>;

			expect(result[0].json.error, `${name} should surface the error`).toContain('403 Forbidden');
		}
	});
});
