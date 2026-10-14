import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the transport so we can assert exactly which endpoint each directory-context operation calls,
// and how it shapes the response, without an HTTP call. The endpoint mapping is the whole contract of
// this resource: every operation is a parameterless GET, so a wrong path is the only way it can break —
// and it would surface only as a 404 at runtime.
vi.mock('../nodes/SynergyManagementGateway/transport/synergyManagementGatewayApiRequest', () => ({
	synergyManagementGatewayApiRequest: vi.fn().mockResolvedValue({ ok: true }),
}));

import { synergyManagementGatewayApiRequest } from '../nodes/SynergyManagementGateway/transport/synergyManagementGatewayApiRequest';
import * as directoryContext from '../nodes/SynergyManagementGateway/actions/directoryContext';
import { SynergyManagementGateway } from '../nodes/SynergyManagementGateway/SynergyManagementGateway.node';

const nodeDescription = new SynergyManagementGateway().description;

const transport = vi.mocked(synergyManagementGatewayApiRequest);

function makeContext(continueOnFail = false) {
	return {
		getInputData: () => [{ json: {} }],
		getNodeParameter: (_name: string, _i: number, fallback?: unknown) => fallback,
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

// operation name -> the API path it must call
const ENDPOINTS: Array<[keyof typeof directoryContext, string]> = [
	['getDirectoryContext', '/ad/directory-context'],
	['getDomain', '/ad/domain'],
	['getForest', '/ad/forest'],
	['getRootDse', '/ad/root-dse'],
	['getDomainControllers', '/ad/domain-controllers'],
	['getTrusts', '/ad/trusts'],
	['getSites', '/ad/sites'],
	['getSubnets', '/ad/subnets'],
	['getSiteLinks', '/ad/site-links'],
	['getOptionalFeatures', '/ad/optional-features'],
	['getKdsRootKeys', '/ad/kds-root-keys'],
];

describe('directoryContext endpoint mapping', () => {
	for (const [operation, endpoint] of ENDPOINTS) {
		it(`${String(operation)} GETs ${endpoint}`, async () => {
			const module = directoryContext[operation] as { execute: (...a: unknown[]) => Promise<unknown> };

			await module.execute.call(makeContext());

			expect(transport).toHaveBeenCalledTimes(1);
			const [method, path] = transport.mock.calls[0];
			expect(method).toBe('GET');
			expect(path).toBe(endpoint);
		});
	}
});

describe('directoryContext response shaping', () => {
	it('fans an array response out to one item per element', async () => {
		// A Domain Controllers read must feed a loop or IF directly, not arrive as one item wrapping
		// an array.
		transport.mockResolvedValue([{ name: 'DC01' }, { name: 'DC02' }] as never);

		const result = await directoryContext.getDomainControllers.execute.call(makeContext());

		expect(result).toHaveLength(2);
		expect((result[0] as { json: unknown }).json).toEqual({ name: 'DC01' });
		expect((result[1] as { json: unknown }).json).toEqual({ name: 'DC02' });
	});

	it('returns a single object response as one item', async () => {
		transport.mockResolvedValue({ dnsRoot: 'example.com' } as never);

		const result = await directoryContext.getDomain.execute.call(makeContext());

		expect(result).toHaveLength(1);
		expect((result[0] as { json: unknown }).json).toEqual({ dnsRoot: 'example.com' });
	});

	it('emits nothing for an empty body rather than an item full of nulls', async () => {
		// A forest legitimately has no site links and no KDS root key; the endpoint answers 204.
		transport.mockResolvedValue(undefined as never);

		const result = await directoryContext.getKdsRootKeys.execute.call(makeContext());

		expect(result).toHaveLength(0);
	});

	it('emits nothing for an empty array', async () => {
		transport.mockResolvedValue([] as never);

		const result = await directoryContext.getSiteLinks.execute.call(makeContext());

		expect(result).toHaveLength(0);
	});
});

describe('directoryContext error handling', () => {
	it('rethrows by default', async () => {
		transport.mockRejectedValue(new Error('403 Forbidden'));

		await expect(directoryContext.getTrusts.execute.call(makeContext())).rejects.toThrow(
			'403 Forbidden',
		);
	});

	it('captures the error as an item when continueOnFail is set', async () => {
		transport.mockRejectedValue(new Error('403 Forbidden'));

		const result = await directoryContext.getTrusts.execute.call(makeContext(true));

		expect(result).toHaveLength(1);
		expect((result[0] as { json: { error: string } }).json.error).toBe('403 Forbidden');
	});
});

describe('directoryContext node registration', () => {
	it('is offered as a resource on the node', async () => {
		const resource = nodeDescription.properties.find((p) => p.name === 'resource');

		expect(resource).toBeDefined();
		const values = (resource!.options as Array<{ value: string }>).map((o) => o.value);
		expect(values).toContain('directoryContext');
	});

	it('offers every implemented operation in the UI', async () => {
		// A resource whose operation list drifts from its modules shows options that fail at runtime.
		const operationProp = directoryContext.description.find(
			(p) => p.name === 'operation' && p.type === 'options',
		);

		expect(operationProp).toBeDefined();
		const offered = (operationProp!.options as Array<{ value: string }>).map((o) => o.value).sort();
		const implemented = ENDPOINTS.map(([op]) => String(op)).sort();

		expect(offered).toEqual(implemented);
	});
});
