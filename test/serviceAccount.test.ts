import { describe, it, expect, vi, beforeEach } from 'vitest';

// Transport mocked so each operation's method, path and body can be asserted. For a resource whose write
// operations hand out credentials and delete service identities, the body is the contract worth pinning.
vi.mock('../nodes/SynergyManagementGateway/transport/synergyManagementGatewayApiRequest', () => ({
	synergyManagementGatewayApiRequest: vi.fn().mockResolvedValue({ ok: true }),
}));

import { synergyManagementGatewayApiRequest } from '../nodes/SynergyManagementGateway/transport/synergyManagementGatewayApiRequest';
import * as serviceAccount from '../nodes/SynergyManagementGateway/actions/serviceAccount';
import { SynergyManagementGateway } from '../nodes/SynergyManagementGateway/SynergyManagementGateway.node';

const nodeDescription = new SynergyManagementGateway().description;

const transport = vi.mocked(synergyManagementGatewayApiRequest);

const ACCOUNT_ID = '11111111-2222-3333-4444-555555555555';
const COMPUTER_ID = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
const GROUP_ID = 'bbbbbbbb-cccc-dddd-eeee-ffffffffffff';
const SID = 'S-1-5-21-1111111111-2222222222-3333333333-1105';

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

describe('serviceAccount resource registration', () => {
	it('is offered in the resource dropdown', () => {
		const resource = nodeDescription.properties.find((p) => p.name === 'resource');
		const values = (resource?.options ?? []).map((o) => (o as { value: string }).value);

		expect(values).toContain('serviceAccount');
	})

	it('offers every exported operation in the dropdown', () => {
		// The router dispatches on the operation value, so an export without a dropdown entry is
		// unreachable and an entry without an export throws at runtime.
		const operationProperty = nodeDescription.properties.find(
			(p) =>
				p.name === 'operation' &&
				(p.displayOptions?.show?.resource as string[] | undefined)?.includes('serviceAccount'),
		);

		const listed = (operationProperty?.options ?? [])
			.map((o) => (o as { value: string }).value)
			.sort();

		const exported = Object.keys(serviceAccount)
			.filter((k) => k !== 'description')
			.sort();

		expect(listed).toEqual(exported);
	});

	it('never masks the retrieval principal field as a secret', () => {
		// The lint autofixer adds typeOptions.password to any field whose name contains "password". These are
		// object GUIDs, not credentials — masking them would hide what the author pasted.
		const fields = serviceAccount.create.description.filter(
			(p) => (p as { typeOptions?: { password?: boolean } }).typeOptions?.password === true,
		);

		expect(fields).toHaveLength(0);
	});
});

describe('reads', () => {
	it('GETs the collection without a kind filter by default', async () => {
		transport.mockResolvedValue([] as never);

		await serviceAccount.getAll.execute.call(makeContext({}) as never);

		const [method, path, qs] = transport.mock.calls[0];
		expect(method).toBe('GET');
		expect(path).toBe('/ad/service-accounts');
		expect(qs).toBeUndefined();
	});

	it('passes the kind through as a query parameter', async () => {
		transport.mockResolvedValue([] as never);

		await serviceAccount.getAll.execute.call(makeContext({ kind: 'group' }) as never);

		expect(transport.mock.calls[0][2]).toEqual({ kind: 'group' });
	});

	it('filters to unusable accounts when asked', async () => {
		// The useful audit filter: a group account naming no retrieval principals exists and is enabled while
		// nothing can authenticate as it.
		transport.mockResolvedValue([
			{ name: 'svc-a', isUnusable: false },
			{ name: 'svc-b', isUnusable: true },
		] as never);

		const result = (await serviceAccount.getAll.execute.call(
			makeContext({ unusableOnly: true }) as never,
		)) as Array<{ json: { name: string } }>;

		expect(result).toHaveLength(1);
		expect(result[0].json.name).toBe('svc-b');
	});

	it('GETs one account by id', async () => {
		await serviceAccount.getById.execute.call(
			makeContext({ serviceAccountId: ACCOUNT_ID }) as never,
		);

		expect(transport.mock.calls[0][1]).toBe(`/ad/service-accounts/${ACCOUNT_ID}`);
	});

	it('GETs the KDS readiness check', async () => {
		await serviceAccount.getKdsReadiness.execute.call(makeContext({}) as never);

		const [method, path] = transport.mock.calls[0];
		expect(method).toBe('GET');
		expect(path).toBe('/ad/service-accounts/kds-readiness');
	});

	it('normalises a non-array principals response', async () => {
		// An account with no principals legitimately yields an empty body; assuming the collection shape
		// would crash the node instead of returning nothing.
		transport.mockResolvedValue({ sid: SID, name: 'WEB01$' } as never);

		const result = (await serviceAccount.getPasswordRetrievalPrincipals.execute.call(
			makeContext({ serviceAccountId: ACCOUNT_ID }) as never,
		)) as unknown[];

		expect(result).toHaveLength(1);
	});

	it('reports a computer with no linked accounts as an empty list', async () => {
		transport.mockResolvedValue(undefined as never);

		const result = (await serviceAccount.getComputerServiceAccounts.execute.call(
			makeContext({ computerId: COMPUTER_ID }) as never,
		)) as Array<{ json: { serviceAccounts: unknown[] } }>;

		expect(result[0].json.serviceAccounts).toEqual([]);
	});
});

describe('create', () => {
	it('POSTs name and kind, defaulting to group', async () => {
		await serviceAccount.create.execute.call(
			makeContext({ name: 'svc-web', kind: 'group' }) as never,
		);

		const [method, path, qs, body] = transport.mock.calls[0];
		expect(method).toBe('POST');
		expect(path).toBe('/ad/service-accounts');
		expect(qs).toBeUndefined();
		expect(body).toEqual({ name: 'svc-web', kind: 'group' });
	});

	it('splits the retrieval principal GUIDs into an array', async () => {
		await serviceAccount.create.execute.call(
			makeContext({
				name: 'svc-web',
				kind: 'group',
				retrievalPrincipalObjectIds: `${COMPUTER_ID}, ${GROUP_ID}`,
			}) as never,
		);

		expect((transport.mock.calls[0][3] as Record<string, unknown>)['passwordRetrievalPrincipalObjectIds'])
			.toEqual([COMPUTER_ID, GROUP_ID]);
	});

	it('omits the rotation interval for a standalone account', async () => {
		// The API rejects it for a standalone account rather than writing nothing, so forwarding the UI
		// default unconditionally would turn a harmless-looking field into a 400.
		await serviceAccount.create.execute.call(
			makeContext({
				name: 'svc-local',
				kind: 'standalone',
				additionalFields: { managedPasswordIntervalDays: 30 },
			}) as never,
		);

		expect(transport.mock.calls[0][3]).not.toHaveProperty('managedPasswordIntervalDays');
	});

	it('sends the rotation interval for a group account', async () => {
		await serviceAccount.create.execute.call(
			makeContext({
				name: 'svc-web',
				kind: 'group',
				additionalFields: { managedPasswordIntervalDays: 90 },
			}) as never,
		);

		expect((transport.mock.calls[0][3] as Record<string, unknown>)['managedPasswordIntervalDays'])
			.toBe(90);
	});

	it('omits the retrieval principals for a standalone account', async () => {
		await serviceAccount.create.execute.call(
			makeContext({
				name: 'svc-local',
				kind: 'standalone',
				retrievalPrincipalObjectIds: COMPUTER_ID,
			}) as never,
		);

		expect(transport.mock.calls[0][3]).not.toHaveProperty('passwordRetrievalPrincipalObjectIds');
	});

	it('forwards isUnusable rather than reducing the result to success', async () => {
		transport.mockResolvedValue({ objectGuid: ACCOUNT_ID, isUnusable: true } as never);

		const result = (await serviceAccount.create.execute.call(
			makeContext({ name: 'svc-web', kind: 'group' }) as never,
		)) as Array<{ json: Record<string, unknown> }>;

		expect(result[0].json.isUnusable).toBe(true);
	});

	it('defaults the kind field to group in the UI', () => {
		// A standalone account cannot be shared and the choice is irreversible, so the safer default is the
		// one that works for a service on more than one host.
		const kind = serviceAccount.create.description.find((p) => p.name === 'kind');
		expect(kind?.default).toBe('group');
	});
});

describe('update', () => {
	it('PATCHes only the supplied fields', async () => {
		await serviceAccount.update.execute.call(
			makeContext({
				serviceAccountId: ACCOUNT_ID,
				updateFields: { description: 'Web tier' },
			}) as never,
		);

		const [method, path, , body] = transport.mock.calls[0];
		expect(method).toBe('PATCH');
		expect(path).toBe(`/ad/service-accounts/${ACCOUNT_ID}`);
		expect(body).toEqual({ description: 'Web tier' });
	});

	it('sends an empty string so a field can be cleared', async () => {
		// Presence, not truthiness: an empty string is the documented clear, and a truthiness test would
		// silently drop it.
		await serviceAccount.update.execute.call(
			makeContext({
				serviceAccountId: ACCOUNT_ID,
				updateFields: { description: '' },
			}) as never,
		);

		expect(transport.mock.calls[0][3]).toEqual({ description: '' });
	});

	it('splits the SPN list and sends an empty array to remove all', async () => {
		await serviceAccount.update.execute.call(
			makeContext({
				serviceAccountId: ACCOUNT_ID,
				updateFields: { servicePrincipalNames: '' },
			}) as never,
		);

		expect(transport.mock.calls[0][3]).toEqual({ servicePrincipalNames: [] });
	});

	it('offers no rotation-interval field', () => {
		// AD fixes it at creation and ignores later writes, so the field must not exist to be filled in.
		const fields = serviceAccount.update.description.find((p) => p.name === 'updateFields');
		const names = ((fields?.options ?? []) as Array<{ name: string }>).map((o) => o.name);

		expect(names).not.toContain('managedPasswordIntervalDays');
	});
});

describe('destructive operations', () => {
	it('DELETEs an account by id', async () => {
		await serviceAccount.deleteById.execute.call(
			makeContext({ serviceAccountId: ACCOUNT_ID }) as never,
		);

		const [method, path] = transport.mock.calls[0];
		expect(method).toBe('DELETE');
		expect(path).toBe(`/ad/service-accounts/${ACCOUNT_ID}`);
	});

	it('PUTs the complete principal set', async () => {
		await serviceAccount.setPasswordRetrievalPrincipals.execute.call(
			makeContext({
				serviceAccountId: ACCOUNT_ID,
				principalObjectIds: COMPUTER_ID,
				principalSids: SID,
			}) as never,
		);

		const [method, path, , body] = transport.mock.calls[0];
		expect(method).toBe('PUT');
		expect(path).toBe(`/ad/service-accounts/${ACCOUNT_ID}/password-retrieval-principals`);
		expect(body).toEqual({
			principalObjectIds: [COMPUTER_ID],
			principalSids: [SID],
		});
	});

	it('reports revokedAll when the principal set is emptied', async () => {
		// The destructive case surfaced so a workflow can branch on it rather than recomputing it from two
		// empty arrays: revoking every principal stops the service authenticating everywhere.
		const result = (await serviceAccount.setPasswordRetrievalPrincipals.execute.call(
			makeContext({ serviceAccountId: ACCOUNT_ID }) as never,
		)) as Array<{ json: { revokedAll: boolean; principalCount: number } }>;

		expect(transport.mock.calls[0][3]).toEqual({ principalObjectIds: [], principalSids: [] });
		expect(result[0].json.revokedAll).toBe(true);
		expect(result[0].json.principalCount).toBe(0);
	});

	it('PUTs a computer link on the computer route', async () => {
		await serviceAccount.setComputerLink.execute.call(
			makeContext({
				computerId: COMPUTER_ID,
				serviceAccountId: ACCOUNT_ID,
				linked: true,
			}) as never,
		);

		const [method, path, , body] = transport.mock.calls[0];
		expect(method).toBe('PUT');
		expect(path).toBe(`/ad/computers/${COMPUTER_ID}/service-accounts`);
		expect(body).toEqual({ serviceAccountId: ACCOUNT_ID, linked: true });
	});

	it('sends linked false to unlink', async () => {
		await serviceAccount.setComputerLink.execute.call(
			makeContext({
				computerId: COMPUTER_ID,
				serviceAccountId: ACCOUNT_ID,
				linked: false,
			}) as never,
		);

		expect((transport.mock.calls[0][3] as Record<string, unknown>)['linked']).toBe(false);
	});
});

describe('continueOnFail', () => {
	it('emits an error item rather than throwing, for every operation', async () => {
		transport.mockRejectedValue(new Error('403 Forbidden'));

		const params = {
			serviceAccountId: ACCOUNT_ID,
			computerId: COMPUTER_ID,
			name: 'svc-web',
			kind: 'group',
			linked: true,
			updateFields: { description: 'x' },
			additionalFields: {},
		};

		for (const [name, module] of Object.entries(serviceAccount)) {
			if (name === 'description') continue;

			const result = (await (module as { execute: (...a: unknown[]) => Promise<unknown> }).execute.call(
				makeContext(params, true) as never,
			)) as Array<{ json: { error?: string } }>;

			expect(result[0].json.error, `${name} should surface the error`).toContain('403 Forbidden');
		}
	});
});
