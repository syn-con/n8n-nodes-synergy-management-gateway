import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';


import { synergyManagementGatewayApiRequest } from '../nodes/SynergyManagementGateway/transport/synergyManagementGatewayApiRequest';
import {
	parseApprovalPending,
	isApprovalPending,
	APPROVAL_REQUIRED_CODE,
} from '../nodes/SynergyManagementGateway/transport/approvalPending';
import { toErrorOutput } from '../nodes/SynergyManagementGateway/helpers/errorOutput';

/**
 * An operation whose policy requires approval is answered with `202 Accepted` and an operation id
 * rather than being carried out. These tests pin the node's half of that contract:
 *
 *  - the 202 body is never mistaken for the affected AD object;
 *  - the operation id survives, whichever way the item ends (thrown error or emitted item);
 *  - "Wait for Approval" polls until a decision lands, and respects its timeout.
 */

const OPERATION_ID = '3f2504e0-4f89-11d3-9a0c-0305e82c3301';

const acceptedBody = {
	operationId: OPERATION_ID,
	code: APPROVAL_REQUIRED_CODE,
	status: 'WaitingToApprove',
	displayName: 'Create User',
	message: "The operation 'Create User' requires approval.",
	expiresAt: '2026-08-16T10:30:00Z',
	pollUrl: `/api/operations/${OPERATION_ID}`,
};

function makeTransportContext(
	response: { statusCode: number; body?: unknown },
	nodeParams: Record<string, unknown> = {},
) {
	return {
		getCredentials: async () => ({
			apiUrl: 'https://ad-api.example.com',
			apiKey: 'test-key',
			clientId: 'test-client',
			ignoreSslErrors: false,
		}),
		getNode: () => ({ name: 'ActiveDirectory' }),
		getNodeParameter: (name: string, _i?: number, fallback?: unknown) =>
			name in nodeParams ? nodeParams[name] : fallback,
		helpers: {
			httpRequestWithAuthentication: async () => response,
		},
	};
}

describe('parseApprovalPending', () => {
	it('recognises a 202 carrying an operation id', () => {
		const parsed = parseApprovalPending(202, acceptedBody);

		expect(parsed).not.toBeNull();
		expect(parsed?.approvalRequired).toBe(true);
		expect(parsed?.operationId).toBe(OPERATION_ID);
		expect(parsed?.pollUrl).toBe(`/api/operations/${OPERATION_ID}`);
		expect(isApprovalPending(parsed)).toBe(true);
	});

	it('ignores ordinary success responses', () => {
		expect(parseApprovalPending(200, { objectGuid: 'abc' })).toBeNull();
		expect(parseApprovalPending(201, { objectGuid: 'abc' })).toBeNull();
		expect(parseApprovalPending(204, undefined)).toBeNull();
	});

	it('ignores a 202 with no operation id, since there is nothing to poll', () => {
		expect(parseApprovalPending(202, { message: 'queued' })).toBeNull();
	});
});

describe('synergyManagementGatewayApiRequest on 202', () => {
	it('throws with the operation id attached by default', async () => {
		const ctx = makeTransportContext({ statusCode: 202, body: acceptedBody });

		const error = await synergyManagementGatewayApiRequest
			.call(ctx as never, 'POST', '/ad/users', undefined, { name: 'jdoe' })
			.then(
				() => null,
				(e) => e,
			);

		expect(error).not.toBeNull();
		// The handle must survive the failure, or the queued change is unreachable.
		expect(error.adOperationId).toBe(OPERATION_ID);
		expect(error.adErrorCode).toBe(APPROVAL_REQUIRED_CODE);
		expect(error.adApprovalRequired).toBe(true);
	});

	it('returns a marked item when the node opts to continue', async () => {
		const ctx = makeTransportContext(
			{ statusCode: 202, body: acceptedBody },
			{ options: { onApprovalRequired: 'continue' } },
		);

		const result = await synergyManagementGatewayApiRequest.call(
			ctx as never,
			'POST',
			'/ad/users',
			undefined,
			{ name: 'jdoe' },
		);

		expect(isApprovalPending(result)).toBe(true);
		expect((result as Record<string, unknown>).operationId).toBe(OPERATION_ID);
		// Critically, it is NOT the created object — nothing downstream should read it as one.
		expect((result as Record<string, unknown>).objectGuid).toBeUndefined();
	});

	it('leaves a normal 201 response untouched', async () => {
		const ctx = makeTransportContext({ statusCode: 201, body: { objectGuid: 'abc' } });

		const result = await synergyManagementGatewayApiRequest.call(
			ctx as never,
			'POST',
			'/ad/users',
			undefined,
			{ name: 'jdoe' },
		);

		expect(result).toEqual({ objectGuid: 'abc' });
	});

	it('keeps the API error code on an ordinary failure', async () => {
		const ctx = makeTransportContext({
			statusCode: 400,
			body: { errorCode: 'AD.User.Invalid', detail: 'bad request' },
		});

		const error = await synergyManagementGatewayApiRequest
			.call(ctx as never, 'POST', '/ad/users', undefined, { name: '' })
			.then(
				() => null,
				(e) => e,
			);

		expect(error.adErrorCode).toBe('AD.User.Invalid');
		expect(error.adHttpCode).toBe('400');
	});
});

describe('toErrorOutput', () => {
	it('carries the operation id and code out to the item', () => {
		const error = Object.assign(new Error('Operation requires approval'), {
			adErrorCode: APPROVAL_REQUIRED_CODE,
			adOperationId: OPERATION_ID,
			adApprovalRequired: true,
		});

		expect(toErrorOutput(error)).toEqual({
			error: 'Operation requires approval',
			errorCode: APPROVAL_REQUIRED_CODE,
			operationId: OPERATION_ID,
			approvalRequired: true,
			httpCode: '202',
		});
	});

	it('falls back to the bare message for an unannotated error', () => {
		expect(toErrorOutput(new Error('boom'))).toEqual({ error: 'boom' });
	});
});

// --- Wait for Approval ---------------------------------------------------------------------

function makeExecuteContext(params: Record<string, unknown>, continueOnFail = false) {
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

describe('operation/waitForApproval', () => {
	beforeEach(() => {
		vi.resetModules();
	});

	async function loadWithResponses(responses: Array<Record<string, unknown>>) {
		const calls: string[] = [];
		vi.doMock('../nodes/SynergyManagementGateway/transport/synergyManagementGatewayApiRequest', () => ({
			synergyManagementGatewayApiRequest: vi.fn(async (_m: string, endpoint: string) => {
				calls.push(endpoint);
				return responses[Math.min(calls.length - 1, responses.length - 1)];
			}),
		}));
		const mod = await import(
			'../nodes/SynergyManagementGateway/actions/operation/waitForApproval.operation'
		);
		return { mod, calls };
	}

	it('returns immediately when the decision is already in', async () => {
		const { mod, calls } = await loadWithResponses([
			{ id: OPERATION_ID, status: 'Success', resultMessage: 'Executed' },
		]);

		const result = await mod.execute.call(
			makeExecuteContext({ operationId: OPERATION_ID }) as never,
		);

		expect(calls).toEqual([`/operations/${OPERATION_ID}`]);
		expect(result[0].json).toMatchObject({ status: 'Success', approved: true, decided: true });
	});

	it('polls until the status leaves WaitingToApprove', async () => {
		const { mod, calls } = await loadWithResponses([
			{ id: OPERATION_ID, status: 'WaitingToApprove' },
			{ id: OPERATION_ID, status: 'WaitingToApprove' },
			{ id: OPERATION_ID, status: 'Success' },
		]);

		const result = await mod.execute.call(
			makeExecuteContext({
				operationId: OPERATION_ID,
				pollInterval: 5, // clamped floor; keeps the test quick
				timeout: 60,
			}) as never,
		);

		expect(calls.length).toBe(3);
		expect(result[0].json).toMatchObject({ approved: true });
	}, 30000);

	it('fails the item when the operation was rejected', async () => {
		const { mod } = await loadWithResponses([
			{ id: OPERATION_ID, status: 'Rejected', resultMessage: 'Rejected by approver.' },
		]);

		await expect(
			mod.execute.call(
				makeExecuteContext({ operationId: OPERATION_ID, failOnRejection: true }) as never,
			),
		).rejects.toThrow(/Rejected by approver/);
	});

	it('emits the outcome instead of failing when Fail on Rejection is off', async () => {
		const { mod } = await loadWithResponses([
			{ id: OPERATION_ID, status: 'Rejected', resultMessage: 'Rejected by approver.' },
		]);

		const result = await mod.execute.call(
			makeExecuteContext({ operationId: OPERATION_ID, failOnRejection: false }) as never,
		);

		expect(result[0].json).toMatchObject({ status: 'Rejected', approved: false, decided: true });
	});

	// Its requester withdrew it on My Waiting Operations: it is decided, and it will never run, so polling on
	// would wait out the whole timeout for nothing.
	it('stops waiting when the requester cancelled the request', async () => {
		const { mod, calls } = await loadWithResponses([
			{ id: OPERATION_ID, status: 'Cancelled', resultMessage: 'Cancelled by the requester.' },
		]);

		const result = await mod.execute.call(
			makeExecuteContext({ operationId: OPERATION_ID, failOnRejection: false }) as never,
		);

		expect(calls.length).toBe(1);
		expect(result[0].json).toMatchObject({ status: 'Cancelled', approved: false, decided: true });
	});

	it('times out rather than polling forever', async () => {
		const { mod } = await loadWithResponses([{ id: OPERATION_ID, status: 'WaitingToApprove' }]);

		await expect(
			mod.execute.call(
				makeExecuteContext({
					operationId: OPERATION_ID,
					pollInterval: 5,
					timeout: 1,
				}) as never,
			),
		).rejects.toThrow(/Timed out/);
	}, 30000);

	/**
	 * The server never moves an expired request out of WaitingToApprove, and approvers stop seeing it the
	 * moment it expires. Polling on would run to the timeout — or forever at timeout 0 — and then report
	 * "still waiting" for a request nobody can decide any more.
	 */
	describe('an approval window that has closed', () => {
		const longAgo = '2020-01-01T00:00:00Z';

		it('ends the wait as Expired instead of polling to the timeout', async () => {
			const { mod, calls } = await loadWithResponses([
				{ id: OPERATION_ID, status: 'WaitingToApprove', expiresAt: longAgo },
			]);

			const result = await mod.execute.call(
				makeExecuteContext({
					operationId: OPERATION_ID,
					timeout: 3600,
					failOnRejection: false,
				}) as never,
			);

			expect(calls.length).toBe(1);
			expect(result[0].json).toMatchObject({
				status: 'Expired',
				expired: true,
				approved: false,
				decided: true,
			});
		});

		it('fails the item with an expiry message when Fail on Rejection is on', async () => {
			const { mod } = await loadWithResponses([
				{ id: OPERATION_ID, status: 'WaitingToApprove', expiresAt: longAgo },
			]);

			await expect(
				mod.execute.call(
					makeExecuteContext({ operationId: OPERATION_ID, failOnRejection: true }) as never,
				),
			).rejects.toThrow(/expired .*submit the change again/);
		});

		it('ends a timeout-0 wait at the expiry', async () => {
			const { mod, calls } = await loadWithResponses([
				{ id: OPERATION_ID, status: 'WaitingToApprove', expiresAt: longAgo },
			]);

			const result = await mod.execute.call(
				makeExecuteContext({ operationId: OPERATION_ID, timeout: 0, failOnRejection: false }) as never,
			);

			expect(calls.length).toBe(1);
			expect(result[0].json).toMatchObject({ status: 'Expired' });
		});

		it('reads an expiry with no zone designator as UTC', async () => {
			const { mod } = await loadWithResponses([
				{ id: OPERATION_ID, status: 'WaitingToApprove', expiresAt: '2020-01-01T00:00:00' },
			]);

			const result = await mod.execute.call(
				makeExecuteContext({ operationId: OPERATION_ID, failOnRejection: false }) as never,
			);

			expect(result[0].json).toMatchObject({ expired: true });
		});
	});

	describe('with fake timers', () => {
		beforeEach(() => {
			vi.useFakeTimers();
		});
		afterEach(() => {
			vi.useRealTimers();
		});

		it('keeps polling through the grace period, so a last-second approval still counts', async () => {
			const justExpired = new Date(Date.now() - 10_000).toISOString();
			const { mod, calls } = await loadWithResponses([
				{ id: OPERATION_ID, status: 'WaitingToApprove', expiresAt: justExpired },
				{ id: OPERATION_ID, status: 'Success', expiresAt: justExpired },
			]);

			const pending = mod.execute.call(
				makeExecuteContext({ operationId: OPERATION_ID, pollInterval: 5 }) as never,
			);
			await vi.advanceTimersByTimeAsync(5_000);
			const result = await pending;

			expect(calls.length).toBe(2);
			expect(result[0].json).toMatchObject({ status: 'Success', approved: true, expired: false });
		});

		it('never sleeps past the expiry', async () => {
			const soon = new Date(Date.now() + 20_000).toISOString();
			const { mod, calls } = await loadWithResponses([
				{ id: OPERATION_ID, status: 'WaitingToApprove', expiresAt: soon },
			]);

			const pending = mod.execute.call(
				makeExecuteContext({
					operationId: OPERATION_ID,
					pollInterval: 3600,
					timeout: 0,
					failOnRejection: false,
				}) as never,
			);
			// expiry (20 s) + grace (60 s): the one sleep ends there, not after the hour-long interval.
			await vi.advanceTimersByTimeAsync((20 + mod.EXPIRY_GRACE_SECONDS) * 1000);
			const result = await pending;

			expect(calls.length).toBe(2);
			expect(result[0].json).toMatchObject({ status: 'Expired' });
		});

		it('bounds a timeout-0 wait on a request that names no expiry', async () => {
			const { mod, calls } = await loadWithResponses([
				{ id: OPERATION_ID, status: 'WaitingToApprove' },
			]);

			const pending = mod.execute.call(
				makeExecuteContext({ operationId: OPERATION_ID, pollInterval: 86_400, timeout: 0 }) as never,
			);
			const outcome = expect(pending).rejects.toThrow(/maximum wait/);
			await vi.advanceTimersByTimeAsync(mod.MAX_WAIT_SECONDS * 1000 + 1_000);
			await outcome;

			expect(calls.length).toBe(8);
		});

		it('caps a typed timeout at the hard maximum', async () => {
			const { mod } = await loadWithResponses([{ id: OPERATION_ID, status: 'WaitingToApprove' }]);

			const pending = mod.execute.call(
				makeExecuteContext({
					operationId: OPERATION_ID,
					pollInterval: 86_400,
					timeout: mod.MAX_WAIT_SECONDS * 10,
				}) as never,
			);
			const outcome = expect(pending).rejects.toThrow(`Timed out after ${mod.MAX_WAIT_SECONDS}s`);
			await vi.advanceTimersByTimeAsync(mod.MAX_WAIT_SECONDS * 1000 + 1_000);
			await outcome;
		});
	});

	it('explains itself when no operation id was supplied', async () => {
		const { mod } = await loadWithResponses([{}]);

		await expect(
			mod.execute.call(makeExecuteContext({ operationId: '' }) as never),
		).rejects.toThrow(/No operation ID/);
	});
});
