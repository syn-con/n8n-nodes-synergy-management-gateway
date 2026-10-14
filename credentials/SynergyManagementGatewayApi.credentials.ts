import type {
	ICredentialDataDecryptedObject,
	ICredentialTestRequest,
	ICredentialType,
	IHttpRequestOptions,
	INodeProperties,
	Icon,
} from 'n8n-workflow';

const HTTPS = /^https:\/\//i;

/**
 * Refuses to put the API key on a request that would not travel over TLS.
 *
 * The node's own transport refuses a non-https API URL, but it sets the key itself; this function is what
 * n8n applies to the credential *test* (and to an HTTP Request node using this credential), which used to
 * send `X-API-Key` to whatever URL was typed — over plaintext for `http://`, before any node-level check
 * could run. Same rule as the transport, so a credential that tests green is one the node will accept.
 */
export async function authenticateOverHttps(
	credentials: ICredentialDataDecryptedObject,
	requestOptions: IHttpRequestOptions,
): Promise<IHttpRequestOptions> {
	const apiUrl = String(credentials.apiUrl ?? '');
	// Where the request will actually go: an absolute url wins over the base URL. Also checked, because an
	// HTTP Request node using this credential names its own URL.
	const absolute = (value: string | undefined) => (value && /^[a-z][a-z0-9+.-]*:/i.test(value) ? value : undefined);
	const target = absolute(requestOptions.url) ?? absolute(requestOptions.baseURL) ?? apiUrl;
	if (!HTTPS.test(apiUrl) || !HTTPS.test(target)) {
		throw new Error(
			'Insecure API URL: the SYNERGY Management Gateway API URL must use https://, so the API key is never sent over plaintext.',
		);
	}
	return {
		...requestOptions,
		headers: { ...requestOptions.headers, 'X-API-Key': String(credentials.apiKey ?? '') },
	};
}

export class SynergyManagementGatewayApi implements ICredentialType {
	// This string identifies every stored credential and every node reference to one. It was
	// `activeDirectoryApiKey` until 2.0.0, which n8n's naming rules for verified nodes do not accept; a
	// credential stored with the 1.x package is not found under this name and has to be created again.
	name = 'synergyManagementGatewayApi';
	displayName = 'SYNERGY Management Gateway for Active Directory API';
	// The same artwork in both files: a brand-crimson tile with a white glyph reads on light and dark
	// canvases alike. n8n requires the two themes to name separate files.
	icon: Icon = {
		light: 'file:../icons/synergy.svg',
		dark: 'file:../icons/synergy.dark.svg',
	}
	documentationUrl = 'https://github.com/syn-con/n8n-nodes-synergy-management-gateway#readme';
	properties: INodeProperties[] = [
		// The node is a client of the product, not a connector to Active Directory itself: without an installation of
		// SYNERGY Management Gateway there is nothing for this credential to point at, so say so before anyone fills it in.
		{
			displayName:
				'This node is a custom solution for <b>SYNERGY Management Gateway for Active Directory</b>, a licensed product of SYNERGY Consulting installed on your own Windows server. It works only through that product\'s API and does not connect to Active Directory directly. <a href="https://www.synergy.eu/" target="_blank">Contact SYNERGY</a> for a licence, and see the <a href="https://help.synergy.lt/synergy-management-gateway" target="_blank">user guide</a> to install it and issue an API key.',
			name: 'productNotice',
			type: 'notice',
			default: '',
		},
		{
			displayName: 'API URL',
			name: 'apiUrl',
			type: 'string',
			default: '',
			placeholder: 'https://your-ad-api.example.com/api',
			description: 'The base URL of the SYNERGY Management Gateway API, including the /api prefix (e.g. https://host/api). Must use https:// — plaintext http:// is rejected so the API key cannot be intercepted.',
			required: true,
		},
		//Client ID
		{
			displayName: 'Client ID',
			name: 'clientId',
			type: 'string',
			default: '',
			description: 'The client ID for a binding to an Active Directory connection',
			required: true,
		},
		{
			displayName: 'API Key',
			name: 'apiKey',
			type: 'string',
			typeOptions: {
				password: true,
			},
			default: '',
			description: 'The API key for authentication',
			required: true,
		},
		{
			displayName: 'Ignore SSL Errors',
			name: 'ignoreSslErrors',
			type: 'boolean',
			default: false,
			description: 'INSECURE — disables TLS certificate validation and exposes your API key to man-in-the-middle attacks. Enable only against a trusted local development server, never in production.',
			required: false,
		}
		//ignore ssl errors
	];

	authenticate = authenticateOverHttps;

	test: ICredentialTestRequest = {
		request: {
			// /metadata only requires a valid authenticated identity (any permission), so the
			// test validates the API key without depending on a specific permission grant.
			baseURL: '={{$credentials.apiUrl}}',
			url: '/metadata',
			method: 'GET',
			// Honour "Ignore SSL Errors" as the node's requests do, or a self-signed instance that every
			// run reaches fails its test and pushes people towards workarounds.
			skipSslCertificateValidation: '={{$credentials.ignoreSslErrors}}',
		},
	};
}
