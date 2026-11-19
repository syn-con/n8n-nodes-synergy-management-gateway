import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../nodes/SynergyManagementGateway/transport/synergyManagementGatewayApiRequest', () => ({
	synergyManagementGatewayApiRequest: vi.fn(),
}));

import { synergyManagementGatewayApiRequest } from '../nodes/SynergyManagementGateway/transport/synergyManagementGatewayApiRequest';
import { searchContainers, domainLabel } from '../nodes/SynergyManagementGateway/methods/listSearch';
import { readBaseDn } from '../nodes/SynergyManagementGateway/helpers/baseDn';
import * as user from '../nodes/SynergyManagementGateway/actions/user';
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

	it('is version 1.1 with the container search registered', () => {
		expect(description.version).toEqual([1, 1.1]);
		expect(new SynergyManagementGateway().methods.listSearch?.searchContainers).toBe(searchContainers);
	});

	it('keeps the plain string field for version 1 and the locator for 1.1, for every base DN field', () => {
		const fields = description.properties.filter((p) => p.name === 'baseDn' || p.name === 'path');
		const v1 = fields.filter((p) => p.type === 'string' && p.displayOptions?.show?.['@version']);
		const v11 = fields.filter((p) => p.type === 'resourceLocator');
		expect(v11.length).toBe(6);
		expect(v1.length).toBe(6);
		for (const p of v11) {
			expect(p.modes?.map((m) => m.name)).toEqual(['list', 'dn']);
		}
	});
});
