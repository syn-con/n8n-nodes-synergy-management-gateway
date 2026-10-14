import {
	ITriggerFunctions,
	NodeApiError,
	type IDataObject,
	type IExecuteFunctions,
	type IExecuteSingleFunctions,
	type IHookFunctions,
	type IHttpRequestMethods,
	type ILoadOptionsFunctions,
	JsonObject,
	IHttpRequestOptions,
} from 'n8n-workflow';

import {
	parseApprovalPending,
	type ApprovalPendingItem,
	type OnApprovalRequired,
} from './approvalPending';

type RequestContext =
	| IExecuteFunctions
	| IExecuteSingleFunctions
	| IHookFunctions
	| ILoadOptionsFunctions
	| ITriggerFunctions;

/**
 * Reads the node's "On Approval Required" option, defaulting to `error`.
 *
 * Defensive by design: the transport is also used from load-options and trigger contexts where
 * `getNodeParameter` has a different signature or no parameters to read at all. Failing to read
 * the option must never change the outcome of the request.
 */
function readOnApprovalRequired(context: RequestContext): OnApprovalRequired {
	const getNodeParameter = (context as IExecuteFunctions).getNodeParameter;
	if (typeof getNodeParameter !== 'function') {
		return 'error';
	}

	try {
		const options = getNodeParameter.call(context as IExecuteFunctions, 'options', 0, {}) as IDataObject;
		return options?.onApprovalRequired === 'continue' ? 'continue' : 'error';
	} catch {
		return 'error';
	}
}

/**
 * Turns the approval-pending outcome into a NodeApiError that still carries the operation id, so
 * a workflow using "Continue on Fail" (or reading the error output) can poll for the decision
 * rather than losing the handle entirely.
 */
function approvalPendingError(context: RequestContext, approval: ApprovalPendingItem): NodeApiError {
	const error = new NodeApiError(
		context.getNode(),
		{ ...approval } as JsonObject,
		{
			message: 'Operation requires approval',
			description: `${approval.message} Poll operation ${approval.operationId} for the decision, or set the node option "On Approval Required" to continue.`,
			httpCode: '202',
		},
	);

	// Predictable, transport-owned fields: NodeApiError's own shape varies by n8n version, and
	// these are what `toErrorOutput` reads back when an item continues on fail.
	Object.assign(error, {
		adErrorCode: approval.code,
		adOperationId: approval.operationId,
		adApprovalRequired: true,
	});

	return error;
}

/**
 * Perform an authenticated HTTP request against the Active Directory API.
 *
 * Argument order is `qs` before `body` — query string first, request body last.
 * Both are typed `IDataObject | undefined`, so the compiler cannot catch a swap;
 * keep this order at every call site. Pass `undefined` for whichever a request omits
 * (e.g. GET → `qs, undefined`; POST/PATCH → `undefined, body`).
 */
export async function synergyManagementGatewayApiRequest(
	this: IExecuteFunctions | IExecuteSingleFunctions | IHookFunctions | ILoadOptionsFunctions | ITriggerFunctions,
	method: IHttpRequestMethods,
	endpoint: string,
	qs: IDataObject | undefined,
	body: IDataObject | undefined,
): Promise<unknown> {

	const credential = await this.getCredentials('synergyManagementGatewayApi');
	if (credential === undefined) {
		throw new NodeApiError(this.getNode(), {
			message: 'synergyManagementGatewayApi is not set',
			description: 'Please set the synergyManagementGatewayApi in the credentials',
		});
	}
	const apiUrl = credential.apiUrl as string;
	// Refuse plaintext HTTP: the API key and Active Directory operations (including password resets)
	// must never traverse an unencrypted channel where they could be captured or tampered with.
	if (!/^https:\/\//i.test(apiUrl)) {
		throw new NodeApiError(this.getNode(), {
			message: 'Insecure API URL',
			description: 'The Active Directory API URL must use https:// so the API key and AD operations are not exposed over plaintext.',
		});
	}
	// Reject an endpoint that could re-target the request. Every operation builds its path by interpolating
	// values that came from a free-text field or an upstream node, so a stray character can change which
	// resource is addressed rather than producing a 404: `?` or `#` truncates the path and turns the rest
	// into a query or fragment, and a `..` segment climbs out of it. Query parameters belong in `qs`, so
	// their delimiters are never legitimate here.
	//
	// Guarding centrally rather than in each operation: the whole node builds paths this way, and a check
	// per call site is one that a new operation will forget.
	//
	// Percent-encoded dots, slashes and backslashes are refused too: the server decodes them, so
	// `%2e%2e` is a `..` and `%2f` an extra segment by the time routing sees them. Operations build
	// their paths with `apiPath`, which already requires a GUID for every interpolated id; this is the
	// backstop for a path built any other way.
	if (
		/[?#\\]/.test(endpoint) ||
		/(^|\/)\.\.?(\/|$)/.test(endpoint) ||
		/%(2e|2f|5c)/i.test(endpoint)
	) {
		throw new NodeApiError(this.getNode(), {
			message: 'Invalid API path',
			description:
				`The request path "${endpoint}" contains "?", "#", "..", a backslash or an encoded dot or slash. This normally means an ` +
				'expression produced an unexpected value — check the ID fields feeding this node. ' +
				'Query parameters are set separately and must not be part of the path.',
		});
	}

	// The API key is not set here: n8n adds it through the credential's `authenticate`, which also refuses to
	// send it anywhere but https. Only the binding id, which selects the directory and is no secret, is ours.
	const options: IHttpRequestOptions = {
		headers: {
			'X-Client-ID': `${credential.clientId}`,
		},
		method,
		url: `${apiUrl}${endpoint}`,
		json: true,
		arrayFormat: 'repeat',
		
		returnFullResponse: true,
		skipSslCertificateValidation: credential.ignoreSslErrors as boolean,
		ignoreHttpStatusErrors: true,
	};
	if (body) {
		options.body = body;
	}
	if (qs) {
		options.qs = qs;
	}
	const response = await this.helpers.httpRequestWithAuthentication.call(this, 'synergyManagementGatewayApi', options);
	if (response && response.statusCode > 399) {
		const errorResponse = (response.body as JsonObject) ?? {};
		const fallback: JsonObject = {
			message: `Request failed with status ${response.statusCode}`,
			httpCode: String(response.statusCode),
		};
		const error = new NodeApiError(
			this.getNode(),
			Object.keys(errorResponse).length ? errorResponse : fallback,
		);
		Object.assign(error, {
			adErrorCode: errorResponse.errorCode,
			adHttpCode: String(response.statusCode),
		});
		throw error;
	}

	// 202: the operation policy requires approval, so the API queued the change instead of
	// applying it. The body is a handle, not the affected object — never let it flow on as one.
	const approval = parseApprovalPending(response?.statusCode, response?.body);
	if (approval) {
		if (readOnApprovalRequired(this) === 'error') {
			throw approvalPendingError(this, approval);
		}
		return approval;
	}

	if (response && response.statusCode === 204) {
		return null;
	}
	return response?.body;
}

