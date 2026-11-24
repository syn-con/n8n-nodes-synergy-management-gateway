import type { IExecuteFunctions, INodeProperties } from 'n8n-workflow';

/**
 * A container field taking a DN: the "Base DN" (search root) of the searches, and the parent container
 * ("Path") of the create operations.
 *
 * From the node version given as `since` it is a resource locator with two modes:
 * - **From List** — containers read from the directory tree (`searchContainers`, the browser API).
 * - **By DN** — the distinguished name typed as a raw string, or an expression.
 *
 * `since` is 1.1 for the search roots and 1.2 for the create operations' parent container. Older versions keep
 * the plain string field they always had: a workflow saved with them stores a bare string under the same
 * parameter name, which a resource locator would flag as empty. Keeping the old field for those versions leaves
 * such workflows untouched, and `readBaseDn` accepts either shape.
 */
export function baseDnProperties(
	name: string,
	displayName: string,
	options: {
		required: boolean;
		description: string;
		legacyDisplayName?: string;
		/** Whether the old plain field is required; defaults to `required`. */
		legacyRequired?: boolean;
		since?: number;
	},
): INodeProperties[] {
	const since = options.since ?? 1.1;
	return [
		{
			displayName: options.legacyDisplayName ?? displayName,
			name,
			type: 'string',
			default: '',
			required: options.legacyRequired ?? options.required,
			description: options.description,
			displayOptions: { show: { '@version': [{ _cnd: { lt: since } }] } },
		},
		{
			displayName,
			name,
			type: 'resourceLocator',
			default: { mode: 'list', value: '' },
			required: options.required,
			description: options.description,
			displayOptions: { show: { '@version': [{ _cnd: { gte: since } }] } },
			modes: [
				{
					displayName: 'From List',
					name: 'list',
					type: 'list',
					placeholder: 'Select a container...',
					typeOptions: {
						searchListMethod: 'searchContainers',
						searchable: true,
					},
				},
				{
					displayName: 'By DN',
					name: 'dn',
					type: 'string',
					placeholder: 'OU=Users,DC=example,DC=com',
					validation: [
						{
							type: 'regex',
							properties: {
								// An attribute type, an equals sign, then anything: enough to catch a pasted name or
								// path ("Users", "example.com/Users") without second-guessing escaped characters.
								regex: '^\\s*[A-Za-z][A-Za-z0-9-]*\\s*=.+',
								errorMessage: 'Not a distinguished name — for example OU=Users,DC=example,DC=com',
							},
						},
					],
				},
			],
		},
	];
}

/** The base DN as a string, whether the parameter holds a resource locator (1.1+) or a plain string (1). */
export function readBaseDn(this: IExecuteFunctions, name: string, itemIndex: number): string {
	const raw = this.getNodeParameter(name, itemIndex, '') as unknown;
	if (typeof raw === 'string') return raw.trim();
	if (raw && typeof raw === 'object' && 'value' in raw) {
		const value = (raw as { value: unknown }).value;
		return typeof value === 'string' ? value.trim() : value == null ? '' : String(value).trim();
	}
	return '';
}
