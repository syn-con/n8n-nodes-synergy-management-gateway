import type { IExecuteFunctions, INodeProperties } from 'n8n-workflow';

/**
 * The "Base DN" (search root) field, shared by every operation that searches beneath a container.
 *
 * From node version 1.1 it is a resource locator with two modes:
 * - **From List** — containers read from the directory tree (`searchContainers`, the browser API).
 * - **By DN** — the distinguished name typed as a raw string, or an expression.
 *
 * Version 1 keeps the plain string field it always had. A workflow saved with version 1 stores a bare string
 * under the same parameter name, which a resource locator would flag as empty; keeping the old field for that
 * version leaves those workflows untouched, and `readBaseDn` accepts either shape.
 */
export function baseDnProperties(
	name: string,
	displayName: string,
	options: { required: boolean; description: string; legacyDisplayName?: string },
): INodeProperties[] {
	return [
		{
			displayName: options.legacyDisplayName ?? displayName,
			name,
			type: 'string',
			default: '',
			required: options.required,
			description: options.description,
			displayOptions: { show: { '@version': [1] } },
		},
		{
			displayName,
			name,
			type: 'resourceLocator',
			default: { mode: 'list', value: '' },
			required: options.required,
			description: options.description,
			displayOptions: { show: { '@version': [{ _cnd: { gte: 1.1 } }] } },
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
