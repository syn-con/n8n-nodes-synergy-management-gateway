import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../nodes/SynergyManagementGateway/transport/synergyManagementGatewayApiRequest', () => ({
	synergyManagementGatewayApiRequest: vi.fn().mockResolvedValue({}),
}));

import { synergyManagementGatewayApiRequest } from '../nodes/SynergyManagementGateway/transport/synergyManagementGatewayApiRequest';
import * as preview from '../nodes/SynergyManagementGateway/actions/organizationalUnit/previewAccountState.operation';
import * as enableAccounts from '../nodes/SynergyManagementGateway/actions/organizationalUnit/enableAccounts.operation';
import * as disableAccounts from '../nodes/SynergyManagementGateway/actions/organizationalUnit/disableAccounts.operation';
import { description as ouDescription } from '../nodes/SynergyManagementGateway/actions/organizationalUnit';

const transport = vi.mocked(synergyManagementGatewayApiRequest);
const ouId = '44444444-4444-4444-4444-444444444444';

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

type Json = Record<string, unknown>;
const jsonOf = (result: unknown[]) => (result[0] as { json: Json }).json;

const plan = {
	organizationUnitId: ouId,
	distinguishedName: 'OU=Leavers,DC=example,DC=com',
	action: 'disable',
	kinds: 'users',
	scope: 'oneLevel',
	matched: 3,
	toChange: [],
	alreadyInState: 0,
	excluded: [],
	truncated: false,
	maxItems: 100,
	exceedsLimit: false,
};

beforeEach(() => {
	transport.mockReset();
	transport.mockResolvedValue({});
});

describe('organizationalUnit/previewAccountState', () => {
	it('GETs the plan with action, kinds and scope in qs', async () => {
		transport.mockResolvedValue(plan as never);

		const result = await preview.execute.call(
			makeContext({ ouId, planAction: 'enable', accountKinds: 'all', accountScope: 'subtree' }) as never,
		);

		const [method, path, qs, body] = transport.mock.calls[0];
		expect(method).toBe('GET');
		expect(path).toBe(`/ad/organization-units/${ouId}/accounts/plan`);
		expect(qs).toEqual({ action: 'enable', kinds: 'all', scope: 'subtree' });
		expect(body).toBeUndefined();
		expect(jsonOf(result)).toEqual(plan);
	});

	it('defaults to users in this OU only', async () => {
		await preview.execute.call(makeContext({ ouId, planAction: 'disable' }) as never);

		expect(transport.mock.calls[0][2]).toEqual({ action: 'disable', kinds: 'users', scope: 'oneLevel' });
	});

	it('refuses an OU id that is not a GUID before calling the API', async () => {
		await expect(
			preview.execute.call(makeContext({ ouId: 'OU=Leavers,DC=x', planAction: 'disable' }) as never),
		).rejects.toThrow(/not a valid object ID/);
		expect(transport).not.toHaveBeenCalled();
	});
});

describe.each([
	['enable', enableAccounts],
	['disable', disableAccounts],
] as const)('organizationalUnit/%sAccounts', (action, operation) => {
	it(`POSTs to the ${action} route with kinds and scope in the body`, async () => {
		transport.mockResolvedValue({ plan } as never);

		await operation.execute.call(
			makeContext({ ouId, accountKinds: 'computers', accountScope: 'subtree' }) as never,
		);

		const [method, path, qs, body] = transport.mock.calls[0];
		expect(method).toBe('POST');
		expect(path).toBe(`/ad/organization-units/${ouId}/accounts/${action}`);
		expect(qs).toBeUndefined();
		expect(body).toEqual({ kinds: 'computers', scope: 'subtree' });
	});

	it('reports success with zero counts when nothing needed changing', async () => {
		transport.mockResolvedValue({ plan } as never);

		const json = jsonOf(await operation.execute.call(makeContext({ ouId }) as never));

		expect(json).toMatchObject({ success: true, partialFailure: false, total: 0, succeeded: 0, failed: 0 });
		expect(json.plan).toEqual(plan);
	});

	it('reports success when every account changed', async () => {
		transport.mockResolvedValue({
			plan,
			batch: { batchId: 'b', total: 3, succeeded: 3, failed: 0, items: [{}, {}, {}] },
		} as never);

		const json = jsonOf(await operation.execute.call(makeContext({ ouId }) as never));

		expect(json).toMatchObject({ success: true, partialFailure: false, total: 3, succeeded: 3, failed: 0 });
	});

	it('does not read a 207 as full success, and does not fail the item by default', async () => {
		// A 207 reaches the operation as an ordinary body: some accounts changed, some did not.
		transport.mockResolvedValue({
			plan,
			batch: { batchId: 'b', total: 3, succeeded: 2, failed: 1, items: [{}, {}, { error: 'x' }] },
		} as never);

		const json = jsonOf(await operation.execute.call(makeContext({ ouId }) as never));

		expect(json).toMatchObject({ success: false, partialFailure: true, total: 3, succeeded: 2, failed: 1 });
		expect((json.batch as Json).items).toHaveLength(3);
	});

	it('fails the item on a 207 when Fail on Partial Failure is on', async () => {
		transport.mockResolvedValue({
			plan,
			batch: { batchId: 'b', total: 3, succeeded: 2, failed: 1, items: [] },
		} as never);

		await expect(
			operation.execute.call(makeContext({ ouId, failOnPartialFailure: true }) as never),
		).rejects.toThrow('1 of 3 accounts could not be changed');
	});

	it('emits the approval-pending item unchanged, never success', async () => {
		const pending = {
			approvalRequired: true,
			operationId: '9e3a7c1d-2b4f-4c8e-a1d0-5f6b7c8d9e01',
			code: 'Operation.ApprovalRequired',
			status: 'WaitingToApprove',
			message: 'The operation requires approval.',
		};
		transport.mockResolvedValue(pending as never);

		const json = jsonOf(
			await operation.execute.call(makeContext({ ouId, failOnPartialFailure: true }) as never),
		);

		expect(json).toEqual(pending);
	});

	it('keeps the error code of a refused run under Continue on Fail', async () => {
		const error = new Error('More than 100 accounts would change') as Error & Json;
		error.adErrorCode = 'OrganizationUnitAccounts.TooMany';
		error.adHttpCode = '400';
		transport.mockRejectedValue(error);

		const json = jsonOf(await operation.execute.call(makeContext({ ouId }, true) as never));

		expect(json).toMatchObject({ errorCode: 'OrganizationUnitAccounts.TooMany', httpCode: '400' });
	});
});

describe('organizationalUnit operation labels', () => {
	it('never abbreviate Active Directory in display text', () => {
		const text = JSON.stringify(ouDescription);
		expect(text).not.toMatch(/\bAD\b/);
	});
});
