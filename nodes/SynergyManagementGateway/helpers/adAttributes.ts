import { IDataObject } from 'n8n-workflow';

/**
 * Attribute values from the resource mapper, checked against the Active Directory type its field names
 * and put into the shape the API writes.
 *
 * Every field's display name ends in its type — `[Bool]`, `[DN[]]`, … (see `methods/resourceMapping.ts`)
 * — and the mapper hands each value over in the n8n type that field was declared as: a real boolean for
 * `Bool`, a date (an ISO string, a `Date` or a Luxon `DateTime`) for `GeneralizedTime`/`FileTime`, a number
 * for `Int`/`Long`. Validation once accepted only the strings 'true'/'false' and the compact
 * `yyyyMMddHHmmssZ` form, so neither a boolean nor a date the mapper produced could be written at all.
 *
 * A multi-valued attribute takes an array, or a string with one value per line. A string is **never** split
 * on commas: a distinguished name always contains them (splitting cut `CN=A,OU=X,DC=corp,DC=lt` into four
 * "DNs" that each failed), and so do ordinary values such as "Sales, Vilnius". One line is one value.
 */

/** A value the mapper left empty: not validated, not sent. `false` and `0` are values. */
function isEmpty(value: unknown): boolean {
	return (
		value === undefined ||
		value === null ||
		(typeof value === 'string' && value.trim() === '') ||
		(Array.isArray(value) && value.length === 0)
	);
}

export function mapAttributes(attributes: IDataObject): IDataObject {
	return prepareAttributes(attributes, false);
}

export function validateAttributes(attributes: IDataObject): void {
	prepareAttributes(attributes, true);
}

/**
 * Validates every value against its field's type and returns the attributes to send, converted.
 * With `checkRequired`, a required field left empty is an error too. All problems are reported together.
 */
export function prepareAttributes(attributes: IDataObject, checkRequired = true): IDataObject {
	if (!attributes) {
		throw new Error('Attributes are required');
	}
	const value = attributes.value as IDataObject;
	if (!value) {
		throw new Error('Attributes value is required');
	}
	const schema = attributes.schema as IDataObject[];
	if (!schema) {
		throw new Error('Schema is required');
	}

	const errors: string[] = [];
	const mapped: IDataObject = {};

	if (checkRequired) {
		for (const field of schema) {
			if (field.required && isEmpty(value[field.id as string])) {
				errors.push(`Attribute ${field.id as string} is required`);
			}
		}
	}

	for (const key of Object.keys(value)) {
		const raw = value[key];
		if (isEmpty(raw)) {
			continue;
		}
		try {
			const field = schema.find((candidate) => candidate.id === key);
			if (!field) {
				throw new Error(`Attribute ${key} not found in schema`);
			}
			const displayName = field.displayName as string;
			const adType = getADType(displayName);

			if (isMultiple(adType)) {
				const items = splitMultiple(raw);
				mapped[key] = items.map((item) => convertValue(displayName, item, adType)) as AttributeValue;
			} else {
				mapped[key] = convertValue(displayName, raw, adType);
			}
		} catch (error) {
			errors.push((error as Error).message);
		}
	}

	if (errors.length > 0) {
		throw new Error(errors.join('\n'));
	}
	return mapped;
}

function isMultiple(adType: string): boolean {
	return adType.endsWith('[]');
}

/** The type in a field's display name: `[DN[]]` for "seeAlso [DN[]]". */
function getADType(displayName: string): string {
	const match = displayName.match(/\[([A-Za-z]+(?:\[\])?)\]\s*$/);
	if (match) {
		return match[1];
	}
	throw new Error(`Invalid display name: ${displayName}`);
}

function baseType(adType: string): string {
	return adType.replace(/\[\]$/, '');
}

function splitMultiple(value: unknown): unknown[] {
	const parts: unknown[] = Array.isArray(value)
		? value
		: typeof value === 'string'
			? value.split(/\r?\n/)
			: [value];

	return parts
		.map((part) => (typeof part === 'string' ? part.trim() : part))
		.filter((part) => !isEmpty(part));
}

/** Checks one value against its Active Directory type and returns it in the form the API writes. */
type AttributeValue = IDataObject[string];

function convertValue(displayName: string, value: unknown, adType: string): AttributeValue {
	switch (baseType(adType)) {
		case 'Bool': {
			if (typeof value === 'boolean') {
				return value;
			}
			const text = typeof value === 'string' ? value.trim().toLowerCase() : '';
			if (text === 'true' || text === 'false') {
				return text === 'true';
			}
			throw new Error(`Attribute ${displayName} must be a boolean`);
		}
		case 'Int':
		case 'Long': {
			const isNumeric =
				(typeof value === 'number' && Number.isFinite(value)) ||
				(typeof value === 'string' && value.trim() !== '' && Number.isFinite(Number(value)));
			if (!isNumeric) {
				throw new Error(
					`Attribute ${displayName} must be a ${baseType(adType) === 'Int' ? 'number' : 'long'}`,
				);
			}
			return value as number | string;
		}
		case 'String':
			if (typeof value !== 'string') {
				throw new Error(`Attribute ${displayName} must be a string`);
			}
			return value;
		case 'DN':
			if (typeof value !== 'string' || !isDistinguishedName(value)) {
				throw new Error(`Attribute ${displayName} must be a DN`);
			}
			return value;
		case 'GeneralizedTime': {
			const converted = toGeneralizedTime(value);
			if (converted === undefined) {
				throw new Error(`Attribute ${displayName} must be a generalized time or a date`);
			}
			return converted;
		}
		case 'FileTime': {
			const ms = toEpochMs(value);
			if (ms === undefined) {
				throw new Error(`Attribute ${displayName} must be a valid ISO date string`);
			}
			return typeof value === 'string' ? value : new Date(ms).toISOString();
		}
		default:
			// A type this helper does not check: passed through for the directory to judge.
			return value as AttributeValue;
	}
}

/** Already in Active Directory's own form: yyyyMMddHHmmss, an optional fraction, then Z or an offset. */
const COMPACT_GENERALIZED_TIME = /^\d{14}(?:\.\d{1,7})?(?:Z|[+-]\d{4})$/;

/** An ISO 8601 date or date-time — the form n8n's date fields produce. */
const ISO_DATE = /^\d{4}-\d{2}-\d{2}(?:[T ]\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})?)?$/i;

/** `yyyyMMddHHmmss.0Z` in UTC, the form Active Directory accepts for a GeneralizedTime write. */
function toGeneralizedTime(value: unknown): string | undefined {
	if (typeof value === 'string' && COMPACT_GENERALIZED_TIME.test(value.trim())) {
		return value.trim();
	}
	const ms = toEpochMs(value);
	if (ms === undefined) {
		return undefined;
	}
	const d = new Date(ms);
	const pad = (n: number, width = 2) => String(n).padStart(width, '0');
	return (
		pad(d.getUTCFullYear(), 4) +
		pad(d.getUTCMonth() + 1) +
		pad(d.getUTCDate()) +
		pad(d.getUTCHours()) +
		pad(d.getUTCMinutes()) +
		pad(d.getUTCSeconds()) +
		'.0Z'
	);
}

/**
 * A date value as epoch milliseconds: a `Date`, a Luxon `DateTime` (what n8n's date fields and `$now`
 * hold) or an ISO 8601 string. Free text is refused rather than handed to `Date.parse`, which reads "1"
 * as the year 2001.
 */
function toEpochMs(value: unknown): number | undefined {
	if (value instanceof Date) {
		return Number.isNaN(value.getTime()) ? undefined : value.getTime();
	}
	if (value && typeof value === 'object' && typeof (value as { toMillis?: unknown }).toMillis === 'function') {
		const ms = (value as { toMillis: () => number }).toMillis();
		return Number.isFinite(ms) ? ms : undefined;
	}
	if (typeof value === 'string' && ISO_DATE.test(value.trim())) {
		const text = value.trim();
		// A date-time with no zone is read as UTC, as Active Directory stores it.
		const hasZone = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(text) || !/[T ]/.test(text);
		const ms = Date.parse(hasZone ? text : `${text.replace(' ', 'T')}Z`);
		return Number.isNaN(ms) ? undefined : ms;
	}
	return undefined;
}

/**
 * Whether a string reads as a distinguished name: one or more RDNs separated by unescaped commas, each
 * `type=value` (several joined by `+` for a multi-valued RDN), the type a name or an OID. Any RDN type is
 * allowed — a DN attribute may point at an OU or a domain as well as a CN. Whether the object exists is the
 * directory's question, not this one.
 */
export function isDistinguishedName(value: string): boolean {
	const text = value.trim();
	if (text === '') {
		return false;
	}
	const rdns = splitUnescaped(text, ',');
	return rdns.every((rdn) =>
		splitUnescaped(rdn, '+').every((ava) =>
			/^\s*(?:[A-Za-z][A-Za-z0-9-]*|\d+(?:\.\d+)*)\s*=\s*\S/.test(ava),
		),
	);
}

/** Splits on a separator that is not escaped with a backslash and not inside double quotes. */
function splitUnescaped(text: string, separator: string): string[] {
	const parts: string[] = [];
	let current = '';
	let quoted = false;
	for (let i = 0; i < text.length; i++) {
		const ch = text[i];
		if (ch === '\\' && i + 1 < text.length) {
			current += ch + text[i + 1];
			i++;
			continue;
		}
		if (ch === '"') {
			quoted = !quoted;
		}
		if (ch === separator && !quoted) {
			parts.push(current);
			current = '';
			continue;
		}
		current += ch;
	}
	parts.push(current);
	return parts;
}
