import { describe, it, expect } from 'vitest';

import { SynergyManagementGatewayApi, authenticateOverHttps } from '../credentials/SynergyManagementGatewayApi.credentials';

const credentials = { apiUrl: 'https://gateway.example.com/api', apiKey: 'secret', clientId: 'c', ignoreSslErrors: false };

describe('SynergyManagementGatewayApi credential', () => {
	it('puts the API key on a request to an https URL', async () => {
		const options = await authenticateOverHttps(credentials, {
			baseURL: 'https://gateway.example.com/api',
			url: '/metadata',
			headers: { Accept: 'application/json' },
		});

		expect(options.headers).toEqual({ Accept: 'application/json', 'X-API-Key': 'secret' });
	});

	// The credential test used to send X-API-Key over plaintext before any node-level check could run.
	it('refuses, before any request is sent, an http API URL', async () => {
		await expect(
			authenticateOverHttps({ ...credentials, apiUrl: 'http://gateway/api' }, {
				baseURL: 'http://gateway/api',
				url: '/metadata',
			}),
		).rejects.toThrow(/https/);
	});

	it('refuses an absolute http request URL even when the API URL is https', async () => {
		await expect(
			authenticateOverHttps(credentials, { url: 'http://elsewhere.example.com/collect' }),
		).rejects.toThrow(/https/);
	});

	it('is the function n8n applies to the credential test', () => {
		expect(new SynergyManagementGatewayApi().authenticate).toBe(authenticateOverHttps);
	});

	it('honours Ignore SSL Errors on the credential test, as the node does', () => {
		expect(new SynergyManagementGatewayApi().test.request.skipSslCertificateValidation).toBe('={{$credentials.ignoreSslErrors}}');
	});
});
