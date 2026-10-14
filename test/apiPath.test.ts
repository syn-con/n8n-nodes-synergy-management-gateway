import { describe, it, expect } from 'vitest';

import {
	apiPath,
	routeSegment,
	InvalidPathParameterError,
} from '../nodes/SynergyManagementGateway/transport/apiPath';
import { synergyManagementGatewayApiRequest } from '../nodes/SynergyManagementGateway/transport/synergyManagementGatewayApiRequest';
import { toErrorOutput } from '../nodes/SynergyManagementGateway/helpers/errorOutput';

/**
 * Object ids reach request paths from free-text fields and upstream expressions. Unchecked, a value
 * retargets the call rather than failing: an extra segment turns a delete of one route into a call on
 * another, and `%2e%2e` is decoded into `..` by the server.
 */

const GUID = '3f2504e0-4f89-11d3-9a0c-0305e82c3301';

describe('apiPath', () => {
	it('accepts a GUID and trims surrounding whitespace', () => {
		expect(apiPath`/ad/users/${GUID}/disable`).toBe(`/ad/users/${GUID}/disable`);
		expect(apiPath`/ad/users/${`  ${GUID.toUpperCase()} `}`).toBe(`/ad/users/${GUID.toUpperCase()}`);
	});

	it.each([
		['an extra segment', `${GUID}/disable`],
		['an encoded traversal', '%2e%2e'],
		['a literal traversal', '..'],
		['an encoded slash', `${GUID}%2Fdisable`],
		['a query delimiter', `${GUID}?x=1`],
		['an empty value', ''],
		['a non-string', undefined],
		['a sAMAccountName', 'jdoe'],
	])('refuses %s', (_label, value) => {
		expect(() => apiPath`/ad/users/${value}`).toThrow(InvalidPathParameterError);
	});

	it('encodes a node-chosen route segment instead of GUID-checking it', () => {
		expect(apiPath`/ad/${routeSegment('organization-units')}/${GUID}/move`).toBe(
			`/ad/organization-units/${GUID}/move`,
		);
		expect(apiPath`/ad/${routeSegment('a/b')}/schema`).toBe('/ad/a%2Fb/schema');
	});

	it('produces an error item a workflow can read under Continue on Fail', () => {
		let thrown: unknown;
		const build = () => apiPath`/ad/users/${'not-a-guid'}`;
		try {
			build();
		} catch (error) {
			thrown = error;
		}
		expect(toErrorOutput(thrown).error).toMatch(/not a valid object ID/);
	});
});

describe('synergyManagementGatewayApiRequest path backstop', () => {
	function makeContext(sent: string[]) {
		return {
			getCredentials: async () => ({
				apiUrl: 'https://ad-api.example.com',
				apiKey: 'k',
				clientId: 'c',
				ignoreSslErrors: false,
			}),
			getNode: () => ({ name: 'ActiveDirectory' }),
			helpers: {
				httpRequestWithAuthentication: async (_credentialType: string, options: { url: string }) => {
					sent.push(options.url);
					return { statusCode: 200, body: {} };
				},
			},
		};
	}

	it.each([
		'/ad/users/%2e%2e/groups',
		'/ad/users/%2E%2E%2Fconnections',
		'/ad/users/abc%5c..',
		'/ad/users/abc\\..',
		'/ad/users/./x',
		'/ad/users/../connections',
	])('refuses %s without sending it', async (endpoint) => {
		const sent: string[] = [];
		await expect(
			synergyManagementGatewayApiRequest.call(makeContext(sent) as never, 'DELETE', endpoint, undefined, undefined),
		).rejects.toThrow(/Invalid API path/);
		expect(sent).toEqual([]);
	});

	it('sends an ordinary path', async () => {
		const sent: string[] = [];
		await synergyManagementGatewayApiRequest.call(
			makeContext(sent) as never,
			'DELETE',
			`/ad/users/${GUID}`,
			undefined,
			undefined,
		);
		expect(sent).toEqual([`https://ad-api.example.com/ad/users/${GUID}`]);
	});
});
