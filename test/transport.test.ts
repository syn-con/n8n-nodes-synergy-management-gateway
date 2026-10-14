import { describe, it, expect } from 'vitest';
import type { IHttpRequestOptions } from 'n8n-workflow';
import { synergyManagementGatewayApiRequest } from '../nodes/SynergyManagementGateway/transport/synergyManagementGatewayApiRequest';

/**
 * Guards the argument order of `synergyManagementGatewayApiRequest(method, endpoint, qs, body)`.
 *
 * `qs` and `body` are both `IDataObject | undefined`, so swapping them is invisible to the
 * TypeScript compiler. These tests assert at runtime that the 3rd arg lands on the query
 * string and the 4th arg lands on the request body — the one place a reorder regression hides.
 */
function makeContext(captured: { options?: IHttpRequestOptions; credentialType?: string }) {
	return {
		getCredentials: async () => ({
			apiUrl: 'https://ad-api.example.com',
			apiKey: 'test-key',
			clientId: 'test-client',
			ignoreSslErrors: false,
		}),
		getNode: () => ({ name: 'ActiveDirectory' }),
		helpers: {
			httpRequestWithAuthentication: async (credentialType: string, options: IHttpRequestOptions) => {
				captured.credentialType = credentialType;
				captured.options = options;
				return { statusCode: 200, body: { ok: true } };
			},
		},
	};
}

describe('synergyManagementGatewayApiRequest argument order', () => {
	it('routes the 3rd argument (qs) to options.qs on a GET', async () => {
		const captured: { options?: IHttpRequestOptions } = {};
		await synergyManagementGatewayApiRequest.call(
			makeContext(captured) as never,
			'GET',
			'/ad/users',
			{ pageSize: 10 },
			undefined,
		);

		expect(captured.options?.qs).toEqual({ pageSize: 10 });
		expect(captured.options?.body).toBeUndefined();
	});

	it('routes the 4th argument (body) to options.body on a POST', async () => {
		const captured: { options?: IHttpRequestOptions } = {};
		await synergyManagementGatewayApiRequest.call(
			makeContext(captured) as never,
			'POST',
			'/ad/users',
			undefined,
			{ samAccountName: 'jdoe' },
		);

		expect(captured.options?.body).toEqual({ samAccountName: 'jdoe' });
		expect(captured.options?.qs).toBeUndefined();
	});
});

describe('synergyManagementGatewayApiRequest authentication', () => {
	it('authenticates through the credential and never sets the API key itself', async () => {
		const captured: { options?: IHttpRequestOptions; credentialType?: string } = {};
		await synergyManagementGatewayApiRequest.call(makeContext(captured) as never, 'GET', '/ad/users', undefined, undefined);

		// The key is added by the credential's `authenticate`, which also refuses anything but https.
		expect(captured.credentialType).toBe('synergyManagementGatewayApi');
		expect(captured.options?.headers).not.toHaveProperty('X-API-Key');
		expect(captured.options?.headers).toMatchObject({ 'X-Client-ID': 'test-client' });
	});
});
