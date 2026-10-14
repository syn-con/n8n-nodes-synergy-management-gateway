import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the transport so we can capture exactly what each operation sends (method, endpoint, body)
// without making a real HTTP call. This locks in the production-readiness fixes:
//  - computer/update must use PATCH (the API has no PUT route)
//  - object/update must send a FLAT body (no "Attributes" wrapper)
//  - object/create must forward attribute name -> value pairs
vi.mock('../nodes/SynergyManagementGateway/transport/activeDirectoryApiRequest', () => ({
	activeDirectoryApiRequest: vi.fn().mockResolvedValue({ id: 'result-id' }),
}));

import { activeDirectoryApiRequest } from '../nodes/SynergyManagementGateway/transport/activeDirectoryApiRequest';
import * as computerUpdate from '../nodes/SynergyManagementGateway/actions/computer/update.operation';
import * as objectUpdate from '../nodes/SynergyManagementGateway/actions/object/update.operation';
import * as objectCreate from '../nodes/SynergyManagementGateway/actions/object/create.operation';
import * as operationGetWaiting from '../nodes/SynergyManagementGateway/actions/operation/getWaiting.operation';
import * as operationGetById from '../nodes/SynergyManagementGateway/actions/operation/getById.operation';

const transport = vi.mocked(activeDirectoryApiRequest);

function makeContext(params: Record<string, unknown>) {
	return {
		getInputData: () => [{ json: {} }],
		getNodeParameter: (name: string, _i: number, fallback?: unknown) =>
			name in params ? params[name] : fallback,
		continueOnFail: () => false,
		getNode: () => ({ name: 'ActiveDirectory' }),
		helpers: {
			returnJsonArray: (data: unknown[]) => data.map((json) => ({ json })),
			constructExecutionMetaData: (data: unknown[]) => data,
		},
	};
}

beforeEach(() => {
	transport.mockClear();
});

describe('computer/update', () => {
	it('uses PATCH (the API exposes no PUT route for computers)', async () => {
		const ctx = makeContext({
			computerId: '11111111-1111-1111-1111-111111111111',
			accountPolicy: {},
			computerAttributes: {
				value: { description: 'lab machine' },
				schema: [{ id: 'description', displayName: 'description [String]', required: false }],
			},
		});

		await computerUpdate.execute.call(ctx as never);

		expect(transport).toHaveBeenCalledTimes(1);
		const [method, endpoint] = transport.mock.calls[0];
		expect(method).toBe('PATCH');
		expect(endpoint).toBe('/ad/computers/11111111-1111-1111-1111-111111111111');
	});
});

describe('object/update', () => {
	it('sends a flat body (replace at top level, no "attributes" wrapper)', async () => {
		const ctx = makeContext({
			objectId: '22222222-2222-2222-2222-222222222222',
			'attributePatches.replace': [{ id: 'description', value: 'new value' }],
			'attributePatches.delete': [],
			'attributePatches.clear': [],
			'attributePatches.add': [],
		});

		await objectUpdate.execute.call(ctx as never);

		expect(transport).toHaveBeenCalledTimes(1);
		const [method, endpoint, qs, body] = transport.mock.calls[0];
		expect(method).toBe('PATCH');
		expect(endpoint).toBe('/ad/objects/22222222-2222-2222-2222-222222222222');
		expect(qs).toBeUndefined();
		expect(body).toHaveProperty('replace', { description: 'new value' });
		expect(body).not.toHaveProperty('attributes');
	});
});

describe('object/create', () => {
	it('forwards attribute name -> value pairs under attributes (no trailing slash)', async () => {
		const ctx = makeContext({
			objectType: 'user',
			objectName: 'jdoe',
			path: 'OU=Users,DC=example,DC=com',
			'otherAttributes.attribute': [{ attributeName: 'mail', attributeValue: 'jdoe@example.com' }],
		});

		await objectCreate.execute.call(ctx as never);

		expect(transport).toHaveBeenCalledTimes(1);
		const [method, endpoint, , body] = transport.mock.calls[0];
		expect(method).toBe('POST');
		expect(endpoint).toBe('/ad/objects');
		expect(body).toMatchObject({
			objectClass: 'user',
			name: 'jdoe',
			path: 'OU=Users,DC=example,DC=com',
			attributes: { mail: 'jdoe@example.com' },
		});
	});
});

describe('operation/getWaiting', () => {
	it('GETs /operations/waiting with page + limit and no body', async () => {
		transport.mockResolvedValueOnce({
			items: [{ id: 'op-1' }],
			meta: { currentPage: 1, totalPages: 1 },
		});
		const ctx = makeContext({ returnAll: false, limit: 50, search: '' });

		const result = await operationGetWaiting.execute.call(ctx as never);

		expect(transport).toHaveBeenCalledTimes(1);
		const [method, endpoint, qs, body] = transport.mock.calls[0];
		expect(method).toBe('GET');
		expect(endpoint).toBe('/operations/waiting');
		expect(qs).toMatchObject({ page: 1, limit: 50 });
		expect(qs).not.toHaveProperty('search');
		expect(body).toBeUndefined();
		expect(result).toEqual([{ json: { id: 'op-1' } }]);
	});

	it('forwards the search filter and follows pagination until the last page', async () => {
		transport
			.mockResolvedValueOnce({ items: [{ id: 'op-1' }], meta: { currentPage: 1, totalPages: 2 } })
			.mockResolvedValueOnce({ items: [{ id: 'op-2' }], meta: { currentPage: 2, totalPages: 2 } });
		const ctx = makeContext({ returnAll: true, limit: 50, search: 'CreateUser' });

		const result = await operationGetWaiting.execute.call(ctx as never);

		// The operation reuses one qs object across pages (mutating page), so per-call page
		// assertions are unreliable by reference; assert the request count, the forwarded
		// search filter, and that both pages' items are aggregated.
		expect(transport).toHaveBeenCalledTimes(2);
		expect(transport.mock.calls[0][1]).toBe('/operations/waiting');
		expect(transport.mock.calls[0][2]).toHaveProperty('search', 'CreateUser');
		expect(result).toEqual([{ json: { id: 'op-1' } }, { json: { id: 'op-2' } }]);
	});
});

describe('operation/getById', () => {
	it('GETs /operations/{id} with no qs or body and wraps the single result', async () => {
		transport.mockResolvedValueOnce({ id: '9e3a7c1d-2b4f-4c8e-a1d0-5f6b7c8d9e01', status: 'WaitingToApprove' });
		const ctx = makeContext({ operationId: '9e3a7c1d-2b4f-4c8e-a1d0-5f6b7c8d9e01' });

		const result = await operationGetById.execute.call(ctx as never);

		expect(transport).toHaveBeenCalledTimes(1);
		const [method, endpoint, qs, body] = transport.mock.calls[0];
		expect(method).toBe('GET');
		expect(endpoint).toBe('/operations/9e3a7c1d-2b4f-4c8e-a1d0-5f6b7c8d9e01');
		expect(qs).toBeUndefined();
		expect(body).toBeUndefined();
		expect(result).toEqual([{ json: { id: '9e3a7c1d-2b4f-4c8e-a1d0-5f6b7c8d9e01', status: 'WaitingToApprove' } }]);
	});
});
