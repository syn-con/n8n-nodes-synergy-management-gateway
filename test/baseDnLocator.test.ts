import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../nodes/SynergyManagementGateway/transport/synergyManagementGatewayApiRequest', () => ({
	synergyManagementGatewayApiRequest: vi.fn(),
}));

import { synergyManagementGatewayApiRequest } from '../nodes/SynergyManagementGateway/transport/synergyManagementGatewayApiRequest';
import { searchContainers, domainLabel } from '../nodes/SynergyManagementGateway/methods/listSearch';
import { readBaseDn } from '../nodes/SynergyManagementGateway/helpers/baseDn';
import type { INodeProperties } from 'n8n-workflow';
import * as user from '../nodes/SynergyManagementGateway/actions/user';
import * as computer from '../nodes/SynergyManagementGateway/actions/computer';
import * as group from '../nodes/SynergyManagementGateway/actions/group';
import * as organizationalUnit from '../nodes/SynergyManagementGateway/actions/organizationalUnit';
import * as object from '../nodes/SynergyManagementGateway/actions/object';
import * as serviceAccount from '../nodes/SynergyManagementGateway/actions/serviceAccount';
import { SynergyManagementGateway } from '../nodes/SynergyManagementGateway/SynergyManagementGateway.node';

const transport = vi.mocked(synergyManagementGatewayApiRequest);

const ROOT = 'DC=example,DC=com';
const node = (dn: string, name: string, container = true) => ({
	distinguishedName: dn,
	name,
	objectClass: container ? 'organizationalUnit' : 'user',
	mayHaveChildren: container,
});

// A small tree: example.com → Staff (→ Sales), Users (CN container), and an account that is not a container.
const TREE: Record<string, unknown[]> = {
	[ROOT]: [
		node(`OU=Staff,${ROOT}`, 'Staff'),
		node(`CN=Users,${ROOT}`, 'Users'),
		node(`CN=Ada,${ROOT}`, 'Ada', false),
	],
	[`OU=Staff,${ROOT}`]: [node(`OU=Sales,OU=Staff,${ROOT}`, 'Sales')],
	[`CN=Users,${ROOT}`]: [],
	[`OU=Sales,OU=Staff,${ROOT}`]: [],
};

const lookup = { getNode: () => ({ name: 'SMG' }) } as never;

beforeEach(() => {
	transport.mockReset();
	transport.mockImplementation(async (_m, path, qs) => {
		if (path === '/ad/browser/roots') {
			return [
				{ distinguishedName: ROOT, partition: 'Domain' },
				{ distinguishedName: `CN=Configuration,${ROOT}`, partition: 'Configuration' },
			];
		}
		if (path === '/ad/browser/children') {
			return { nodes: TREE[(qs as { dn: string }).dn] ?? [], continuationToken: null };
		}
		throw new Error(`unexpected ${path}`);
	});
});

describe('searchContainers (Base DN from the directory tree)', () => {
	it('walks the domain partition breadth-first and lists only containers, as paths', async () => {
		const { results, paginationToken } = await searchContainers.call(lookup);

		expect(results).toEqual([
			{ name: 'example.com', value: ROOT },
			{ name: 'example.com/Staff', value: `OU=Staff,${ROOT}` },
			{ name: 'example.com/Users', value: `CN=Users,${ROOT}` },
			{ name: 'example.com/Staff/Sales', value: `OU=Sales,OU=Staff,${ROOT}` },
		]);
		expect(paginationToken).toBeUndefined();
		// Configuration is never walked.
		expect(transport.mock.calls.some(([, , qs]) => String((qs as { dn?: string })?.dn).startsWith('CN=Configuration'))).toBe(false);
	});

	it('filters by path or DN, ignoring case', async () => {
		expect((await searchContainers.call(lookup, 'sales')).results.map((r) => r.value)).toEqual([
			`OU=Sales,OU=Staff,${ROOT}`,
		]);
		expect((await searchContainers.call(lookup, 'cn=users')).results.map((r) => r.name)).toEqual([
			'example.com/Users',
		]);
	});

	it('follows a container that spans several pages, and resumes from the token', async () => {
		transport.mockImplementation(async (_m, path, qs) => {
			if (path === '/ad/browser/roots') return [{ distinguishedName: ROOT, partition: 'Domain' }];
			const { dn, continuationToken } = qs as { dn: string; continuationToken?: string };
			if (dn !== ROOT) return { nodes: [], continuationToken: null };
			return continuationToken
				? { nodes: [node(`OU=B,${ROOT}`, 'B')], continuationToken: null }
				: { nodes: [node(`OU=A,${ROOT}`, 'A')], continuationToken: 'page2' };
		});

		const { results } = await searchContainers.call(lookup);
		expect(results.map((r) => r.name)).toEqual(['example.com', 'example.com/A', 'example.com/B']);
	});

	it('hands back the rest of the walk when a batch fills up', async () => {
		const wide = Array.from({ length: 60 }, (_, i) => node(`OU=O${i},${ROOT}`, `O${i}`));
		transport.mockImplementation(async (_m, path, qs) => {
			if (path === '/ad/browser/roots') return [{ distinguishedName: ROOT, partition: 'Domain' }];
			return { nodes: (qs as { dn: string }).dn === ROOT ? wide : [], continuationToken: null };
		});

		const first = await searchContainers.call(lookup);
		expect(first.results.length).toBe(61);
		expect(first.paginationToken).toBeDefined();

		transport.mockClear();
		// Each later call reads at most 15 containers, so the 60 empty OUs take a few more scrolls.
		let token = first.paginationToken;
		let calls = 0;
		while (token && calls < 10) {
			const next = await searchContainers.call(lookup, undefined, token);
			expect(next.results).toEqual([]);
			token = next.paginationToken;
			calls++;
		}
		expect(token).toBeUndefined();
		expect(calls).toBe(4);
		expect(transport.mock.calls.every(([, path]) => path === '/ad/browser/children')).toBe(true);
	});

	it('explains that "By DN" still works when the tree cannot be read', async () => {
		transport.mockRejectedValue(new Error('403'));
		await expect(searchContainers.call(lookup)).rejects.toThrow('Could not read the directory tree');
	});
});

describe('domainLabel', () => {
	it('turns a domain DN into its DNS name and leaves anything else alone', () => {
		expect(domainLabel('DC=corp,DC=example,DC=com')).toBe('corp.example.com');
		expect(domainLabel('OU=X,DC=a')).toBe('OU=X,DC=a');
	});
});

describe('readBaseDn', () => {
	const ctx = (value: unknown) => ({ getNodeParameter: () => value }) as never;

	it('reads a version 1 plain string and a version 1.1 resource locator alike', () => {
		expect(readBaseDn.call(ctx(' OU=A,DC=x '), 'baseDn', 0)).toBe('OU=A,DC=x');
		expect(readBaseDn.call(ctx({ __rl: true, mode: 'list', value: 'OU=B,DC=x' }), 'baseDn', 0)).toBe('OU=B,DC=x');
		expect(readBaseDn.call(ctx({ __rl: true, mode: 'dn', value: '' }), 'baseDn', 0)).toBe('');
		expect(readBaseDn.call(ctx(undefined), 'baseDn', 0)).toBe('');
	});

	it('sends the chosen DN as baseDn from a resource locator', async () => {
		transport.mockResolvedValue({ data: [], meta: { hasNextPage: false } });
		const params: Record<string, unknown> = {
			baseDn: { __rl: true, mode: 'list', value: `OU=Staff,${ROOT}` },
			ldapFilter: '',
			returnAll: false,
			limit: 10,
		};
		const context = {
			getInputData: () => [{ json: {} }],
			getNodeParameter: (name: string, _i: number, fallback?: unknown) => (name in params ? params[name] : fallback),
			continueOnFail: () => false,
			getNode: () => ({ name: 'SMG' }),
			helpers: {
				returnJsonArray: (data: unknown[]) => data.map((json) => ({ json })),
				constructExecutionMetaData: (data: unknown[]) => data,
			},
		};
		await user.getAll.execute.call(context as never);
		expect((transport.mock.calls[0][2] as { baseDn: string }).baseDn).toBe(`OU=Staff,${ROOT}`);
	});
});

describe('node description', () => {
	const description = new SynergyManagementGateway().description;
	const versionCondition = (p: INodeProperties) =>
		(p.displayOptions?.show?.['@version'] as Array<{ _cnd: Record<string, number> }> | undefined)?.[0]?._cnd;

	it('is version 1.2 with the container search registered', () => {
		expect(description.version).toEqual([1, 1.1, 1.2]);
		expect(new SynergyManagementGateway().methods.listSearch?.searchContainers).toBe(searchContainers);
	});

	it('keeps the plain string field before 1.1 and the locator from 1.1, for every base DN field', () => {
		const searchOps = ['getAll', 'searchByState'];
		const fields = description.properties.filter(
			(p) =>
				(p.name === 'baseDn' || p.name === 'path') &&
				searchOps.some((op) => (p.displayOptions?.show?.operation as string[] | undefined)?.includes(op)),
		);
		const plain = fields.filter((p) => p.type === 'string');
		const locators = fields.filter((p) => p.type === 'resourceLocator');
		expect(locators.length).toBe(6);
		expect(plain.length).toBe(6);
		for (const p of plain) expect(versionCondition(p)).toEqual({ lt: 1.1 });
		for (const p of locators) {
			expect(versionCondition(p)).toEqual({ gte: 1.1 });
			expect(p.modes?.map((m) => m.name)).toEqual(['list', 'dn']);
		}
	});

	it('gives every create operation a parent-container locator from 1.2, keeping the old field before it', () => {
		const resources = ['user', 'computer', 'group', 'organizationalUnit', 'object', 'serviceAccount'];
		for (const resource of resources) {
			const fields = description.properties.filter(
				(p) =>
					p.name === 'path' &&
					(p.displayOptions?.show?.resource as string[] | undefined)?.includes(resource) &&
					(p.displayOptions?.show?.operation as string[] | undefined)?.includes('create'),
			);
			const locator = fields.find((p) => p.type === 'resourceLocator');
			expect(locator, resource).toBeDefined();
			expect(versionCondition(locator!), resource).toEqual({ gte: 1.2 });
			expect(locator!.modes?.map((m) => m.name)).toEqual(['list', 'dn']);
			expect(locator!.modes?.[0].typeOptions?.searchListMethod).toBe('searchContainers');
			// The API refuses an empty parent for all but the service account, which falls back to the
			// Managed Service Accounts container.
			expect(locator!.required, resource).toBe(resource !== 'serviceAccount');

			const plain = fields.find((p) => p.type === 'string');
			if (resource === 'serviceAccount') {
				// Before 1.2 its path lives in Additional Fields.
				expect(plain).toBeUndefined();
			} else {
				expect(versionCondition(plain!), resource).toEqual({ lt: 1.2 });
			}
		}
	});

	it('keeps the service account path in Additional Fields only before 1.2', () => {
		const collections = description.properties.filter(
			(p) =>
				p.name === 'additionalFields' &&
				(p.displayOptions?.show?.resource as string[] | undefined)?.includes('serviceAccount'),
		);
		const has = (p: INodeProperties) => (p.options as INodeProperties[]).some((o) => o.name === 'path');
		expect(collections.map((c) => [versionCondition(c), has(c)])).toEqual([
			[{ lt: 1.2 }, true],
			[{ gte: 1.2 }, false],
		]);
	});
});

describe('create operations send the chosen container as path', () => {
	const run = async (
		op: { execute: (this: never) => Promise<unknown> },
		params: Record<string, unknown>,
		typeVersion = 1.2,
	) => {
		transport.mockReset();
		transport.mockResolvedValue({ objectGuid: 'g', distinguishedName: 'CN=x' });
		const context = {
			getInputData: () => [{ json: {} }],
			getNodeParameter: (name: string, _i: number, fallback?: unknown) => (name in params ? params[name] : fallback),
			continueOnFail: () => false,
			getNode: () => ({ name: 'SMG', typeVersion }),
			helpers: {
				returnJsonArray: (data: unknown[]) => data.map((json) => ({ json })),
				constructExecutionMetaData: (data: unknown[]) => data,
			},
		};
		await op.execute.call(context as never);
		return transport.mock.calls[0][3] as Record<string, unknown>;
	};
	const locator = (value: string, mode = 'list') => ({ __rl: true, mode, value });
	const noAttributes = { mappingMode: 'defineBelow', value: {}, schema: [] };

	it('user, computer, group and organizational unit', async () => {
		const dn = `OU=Staff,${ROOT}`;
		expect((await run(user.create, { name: 'u', samAccountName: 'u', path: locator(dn), userAttributes: noAttributes })).path).toBe(dn);
		expect((await run(computer.create, { name: 'c', path: locator(dn, 'dn'), computerAttributes: noAttributes })).path).toBe(dn);
		expect((await run(group.create, { name: 'g', path: locator(dn), groupAttributes: noAttributes })).path).toBe(dn);
		expect((await run(organizationalUnit.create, { name: 'o', path: locator(dn), ouAttributes: noAttributes })).path).toBe(dn);
	});

	it('object, from a locator (1.2) and from a plain string (1.1)', async () => {
		const dn = `OU=Staff,${ROOT}`;
		expect((await run(object.create, { objectType: 'contact', objectName: 'x', path: locator(dn) })).path).toBe(dn);
		expect((await run(object.create, { objectType: 'contact', objectName: 'x', path: dn }, 1.1)).path).toBe(dn);
	});

	it('service account: the locator from 1.2, Additional Fields before it, and nothing when empty', async () => {
		const dn = `OU=Services,${ROOT}`;
		const base = { name: 'svc', kind: 'standalone' };
		expect((await run(serviceAccount.create, { ...base, path: locator(dn), additionalFields: {} })).path).toBe(dn);
		expect((await run(serviceAccount.create, { ...base, additionalFields: { path: dn } }, 1.1)).path).toBe(dn);
		expect(await run(serviceAccount.create, { ...base, path: locator(''), additionalFields: {} })).not.toHaveProperty('path');
	});
});
