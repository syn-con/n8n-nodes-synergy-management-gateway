import { describe, it, expect } from 'vitest';

import {
	isDistinguishedName,
	mapAttributes,
	prepareAttributes,
	validateAttributes,
} from '../nodes/SynergyManagementGateway/helpers/adAttributes';

/**
 * The resource mapper names each field's Active Directory type in its display name and hands the value
 * over in the n8n type that field was declared as (`methods/resourceMapping.ts`): a boolean for Bool, a
 * date for GeneralizedTime/FileTime, a number for Int/Long. These pin that every one of those can be
 * written, and that a distinguished name is never cut on its commas.
 */

type Field = { id: string; type: string; required?: boolean };

function attrs(fields: Field[], value: Record<string, unknown>) {
	return {
		value,
		schema: fields.map((f) => ({
			id: f.id,
			displayName: `${f.id}${f.required ? ' *' : ''} [${f.type}]`,
			required: f.required ?? false,
		})),
	};
}

describe('adAttributes', () => {
	describe('Bool', () => {
		const fields = [{ id: 'msExchHideFromAddressLists', type: 'Bool' }];

		it('accepts the boolean the mapper supplies, true and false alike', () => {
			expect(mapAttributes(attrs(fields, { msExchHideFromAddressLists: true }))).toEqual({
				msExchHideFromAddressLists: true,
			});
			// false is a value, not "empty": switching an attribute off must be sent.
			expect(mapAttributes(attrs(fields, { msExchHideFromAddressLists: false }))).toEqual({
				msExchHideFromAddressLists: false,
			});
		});

		it('accepts the strings true/false in any case, as a boolean', () => {
			expect(mapAttributes(attrs(fields, { msExchHideFromAddressLists: 'TRUE' }))).toEqual({
				msExchHideFromAddressLists: true,
			});
		});

		it('refuses anything else', () => {
			expect(() =>
				validateAttributes(attrs(fields, { msExchHideFromAddressLists: 'yes' })),
			).toThrow(/must be a boolean/);
		});

		it('counts false as present for a required field', () => {
			expect(() =>
				validateAttributes(
					attrs([{ id: 'flag', type: 'Bool', required: true }], { flag: false }),
				),
			).not.toThrow();
		});
	});

	describe('GeneralizedTime', () => {
		const fields = [{ id: 'msDS-Expiry', type: 'GeneralizedTime' }];

		it('converts the ISO string a date field produces to Active Directory form', () => {
			expect(
				mapAttributes(attrs(fields, { 'msDS-Expiry': '2026-10-01T12:34:56.000Z' })),
			).toEqual({ 'msDS-Expiry': '20261001123456.0Z' });
		});

		it('converts an offset to UTC', () => {
			expect(
				mapAttributes(attrs(fields, { 'msDS-Expiry': '2026-10-01T14:34:56+02:00' })),
			).toEqual({ 'msDS-Expiry': '20261001123456.0Z' });
		});

		it('converts a Luxon DateTime and a Date', () => {
			// Luxon is n8n's own dependency, not this package's, so stand in for a DateTime by its one
			// member the helper reads.
			const luxon = { toMillis: () => Date.UTC(2026, 9, 1, 12, 34, 56), toISO: () => '' };
			expect(mapAttributes(attrs(fields, { 'msDS-Expiry': luxon }))).toEqual({
				'msDS-Expiry': '20261001123456.0Z',
			});
			expect(
				mapAttributes(attrs(fields, { 'msDS-Expiry': new Date(Date.UTC(2026, 9, 1, 12, 34, 56)) })),
			).toEqual({ 'msDS-Expiry': '20261001123456.0Z' });
		});

		it('keeps a value already in compact form', () => {
			expect(mapAttributes(attrs(fields, { 'msDS-Expiry': '20261001123456.0Z' }))).toEqual({
				'msDS-Expiry': '20261001123456.0Z',
			});
			expect(mapAttributes(attrs(fields, { 'msDS-Expiry': '20261001123456Z' }))).toEqual({
				'msDS-Expiry': '20261001123456Z',
			});
		});

		it('refuses free text rather than guessing a date from it', () => {
			expect(() => validateAttributes(attrs(fields, { 'msDS-Expiry': '1' }))).toThrow(
				/generalized time/,
			);
			expect(() => validateAttributes(attrs(fields, { 'msDS-Expiry': 'next week' }))).toThrow(
				/generalized time/,
			);
		});
	});

	describe('Int and Long', () => {
		const fields = [
			{ id: 'countryCode', type: 'Int' },
			{ id: 'big', type: 'Long' },
		];

		it('accepts numbers and numeric strings, including 0', () => {
			expect(mapAttributes(attrs(fields, { countryCode: 0, big: '9007199254740' }))).toEqual({
				countryCode: 0,
				big: '9007199254740',
			});
		});

		it('refuses text and booleans', () => {
			expect(() => validateAttributes(attrs(fields, { countryCode: 'abc' }))).toThrow(
				/must be a number/,
			);
			expect(() => validateAttributes(attrs(fields, { big: true }))).toThrow(/must be a long/);
		});
	});

	describe('DN', () => {
		it('accepts a DN whatever its first RDN is', () => {
			expect(isDistinguishedName('CN=Jane Doe,OU=Staff,DC=corp,DC=lt')).toBe(true);
			expect(isDistinguishedName('OU=Staff,DC=corp,DC=lt')).toBe(true);
			expect(isDistinguishedName('DC=corp,DC=lt')).toBe(true);
		});

		it('accepts escaped commas and multi-valued RDNs', () => {
			expect(isDistinguishedName('CN=Doe\\, Jane,OU=Staff,DC=corp,DC=lt')).toBe(true);
			expect(isDistinguishedName('CN=Jane+UID=42,DC=corp,DC=lt')).toBe(true);
		});

		it('refuses what is not a DN', () => {
			expect(isDistinguishedName('Jane Doe')).toBe(false);
			expect(isDistinguishedName('CN=,DC=lt')).toBe(false);
			expect(isDistinguishedName('CN=Jane,,DC=lt')).toBe(false);
			expect(isDistinguishedName('')).toBe(false);
		});

		it('never splits a single-valued DN', () => {
			const fields = [{ id: 'manager', type: 'DN' }];
			expect(
				mapAttributes(attrs(fields, { manager: 'CN=Boss,OU=Staff,DC=corp,DC=lt' })),
			).toEqual({ manager: 'CN=Boss,OU=Staff,DC=corp,DC=lt' });
		});

		it('never splits a multi-valued DN on its commas', () => {
			const fields = [{ id: 'seeAlso', type: 'DN[]' }];
			expect(mapAttributes(attrs(fields, { seeAlso: 'CN=A,OU=X,DC=corp,DC=lt' }))).toEqual({
				seeAlso: ['CN=A,OU=X,DC=corp,DC=lt'],
			});
		});

		it('takes several DNs as an array or one per line', () => {
			const fields = [{ id: 'seeAlso', type: 'DN[]' }];
			const expected = { seeAlso: ['CN=A,OU=X,DC=corp,DC=lt', 'CN=B,OU=Y,DC=corp,DC=lt'] };

			expect(
				mapAttributes(
					attrs(fields, { seeAlso: ['CN=A,OU=X,DC=corp,DC=lt', 'CN=B,OU=Y,DC=corp,DC=lt'] }),
				),
			).toEqual(expected);
			expect(
				mapAttributes(
					attrs(fields, { seeAlso: 'CN=A,OU=X,DC=corp,DC=lt\nCN=B,OU=Y,DC=corp,DC=lt\n' }),
				),
			).toEqual(expected);
		});

		it('reports the bad DN in a list', () => {
			const fields = [{ id: 'seeAlso', type: 'DN[]' }];
			expect(() =>
				validateAttributes(attrs(fields, { seeAlso: ['CN=A,DC=lt', 'not a dn'] })),
			).toThrow(/must be a DN/);
		});
	});

	describe('String', () => {
		it('keeps a single-valued string whole, commas included', () => {
			const fields = [{ id: 'description', type: 'String' }];
			expect(mapAttributes(attrs(fields, { description: 'Sales, Vilnius' }))).toEqual({
				description: 'Sales, Vilnius',
			});
		});

		it('splits a multi-valued string on newlines only, never on commas', () => {
			const fields = [{ id: 'otherTelephone', type: 'String[]' }];
			expect(mapAttributes(attrs(fields, { otherTelephone: '+370 1\n+370 2' }))).toEqual({
				otherTelephone: ['+370 1', '+370 2'],
			});
			expect(mapAttributes(attrs(fields, { otherTelephone: 'Sales, Vilnius' }))).toEqual({
				otherTelephone: ['Sales, Vilnius'],
			});
		});
	});

	describe('empty and unknown values', () => {
		it('sends nothing for a field left empty', () => {
			const fields = [
				{ id: 'description', type: 'String' },
				{ id: 'seeAlso', type: 'DN[]' },
			];
			expect(mapAttributes(attrs(fields, { description: '', seeAlso: null }))).toEqual({});
		});

		it('still requires a required field', () => {
			expect(() =>
				validateAttributes(attrs([{ id: 'cn', type: 'String', required: true }], { cn: '' })),
			).toThrow(/cn is required/);
		});

		it('reports every problem at once', () => {
			const fields = [
				{ id: 'flag', type: 'Bool' },
				{ id: 'count', type: 'Int' },
			];
			expect(() => prepareAttributes(attrs(fields, { flag: 'maybe', count: 'many' }))).toThrow(
				/must be a boolean\n.*must be a number/,
			);
		});

		it('refuses an attribute the schema does not have', () => {
			expect(() => mapAttributes(attrs([], { bogus: 'x' }))).toThrow(/not found in schema/);
		});
	});
});
