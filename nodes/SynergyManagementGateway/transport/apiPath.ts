/**
 * Builds a request path from a template, checking every interpolated value.
 *
 *     apiPath`/ad/users/${userId}/disable`
 *
 * Object ids reach these paths from free-text fields and upstream expressions, so an unchecked value
 * can retarget the call rather than fail: `abc/disable` adds a segment, `%2e%2e` climbs out of the
 * route once the server decodes it. Every id route on the API is GUID-constrained (`{id:guid}`), so
 * an interpolated value must be a GUID — anything else is refused before a request is made, with a
 * message naming the value. Surrounding whitespace is trimmed, since a pasted id often carries some.
 *
 * A value that is a route segment the node itself chose (a typed route such as `users`, a schema
 * resource) is passed through `routeSegment(...)` instead: it is URL-encoded rather than GUID-checked.
 */

const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** A path segment chosen by the node rather than the user; encoded, not GUID-checked. */
export class PathSegment {
	constructor(readonly value: string) {}
}

export function routeSegment(value: string): PathSegment {
	return new PathSegment(value);
}

/** Thrown for an interpolated value that is not a GUID. */
export class InvalidPathParameterError extends Error {
	constructor(value: unknown) {
		const shown = String(value ?? '');
		const display = shown.length > 80 ? `${shown.slice(0, 80)}…` : shown;
		super(
			shown.trim().length === 0
				? 'An object ID is required but was empty. Check the ID field (or the expression feeding it).'
				: `"${display}" is not a valid object ID. The API addresses objects by GUID ` +
					'(for example 3f2504e0-4f89-11d3-9a0c-0305e82c3301) — check the ID field or the expression feeding it.',
		);
		this.name = 'InvalidPathParameterError';
	}
}

/** Returns the trimmed value if it is a GUID; throws InvalidPathParameterError otherwise. */
export function requireGuid(value: unknown): string {
	const text = typeof value === 'string' ? value.trim() : '';
	if (!GUID.test(text)) {
		throw new InvalidPathParameterError(value);
	}
	return text;
}

export function apiPath(strings: TemplateStringsArray, ...values: unknown[]): string {
	let path = strings[0];
	for (let i = 0; i < values.length; i++) {
		const value = values[i];
		const part =
			value instanceof PathSegment ? encodeURIComponent(value.value) : requireGuid(value);
		path += part + strings[i + 1];
	}
	return path;
}
