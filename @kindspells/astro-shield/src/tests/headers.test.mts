/*
 * SPDX-FileCopyrightText: 2024 KindSpells Labs S.L.
 *
 * SPDX-License-Identifier: MIT
 */

import { describe, expect, it } from 'vitest'

import {
	parseCspDirectives,
	patchHeaders,
	serialiseCspDirectives,
	serialiseHashes,
	setSrcDirective,
} from '../headers.mjs'
import type { CSPDirectives, SecurityHeadersOptions } from '../types.mts'

describe('serialiseHashes', () => {
	it('returns an empty string for an empty set', () => {
		expect(serialiseHashes(new Set())).toBe('')
	})

	it('returns a string with sorted hashes', () => {
		const hashes = new Set(['d', 'c', 'a', 'b'])
		expect(serialiseHashes(hashes)).toBe("'a' 'b' 'c' 'd'")
	})

	it('does not try to escape or remove quotes', () => {
		const hashes_1 = new Set(["'a'", "'b'", "'c'", "'d'"])
		const hashes_2 = new Set(['"a"', '"b"', '"c"', '"d"'])

		expect(serialiseHashes(hashes_1)).toBe("''a'' ''b'' ''c'' ''d''")
		expect(serialiseHashes(hashes_2)).toBe(`'"a"' '"b"' '"c"' '"d"'`)
	})
})

describe('serialiseCspDirectives', () => {
	it('returns an empty string for an empty object', () => {
		expect(serialiseCspDirectives({})).toBe('')
	})

	it('returns a string with sorted directives', () => {
		const directives = {
			'child-src': 'a',
			'connect-src': 'b',
			'default-src': 'c',
			'font-src': 'd',
		}

		expect(serialiseCspDirectives(directives)).toBe(
			'child-src a; connect-src b; default-src c; font-src d',
		)
	})
})

describe('setSrcDirective', () => {
	it('sets the directive if it does not exist', () => {
		const directives: CSPDirectives = {}

		setSrcDirective(directives, 'script-src', new Set(['dbc1', 'xyz3', 'abc2']))

		expect(directives['script-src']).to.not.toBeUndefined()
		expect(directives['script-src']).toBe("'self' 'abc2' 'dbc1' 'xyz3'")
	})

	it('merges the directive if it exists', () => {
		const directives: CSPDirectives = {
			'script-src': "'self' 'abc1' 'xyz2'",
		}

		setSrcDirective(
			directives,
			'script-src',
			new Set(['dbc1', 'xyz3', 'abc2', 'abc1']),
		)

		expect(directives['script-src']).toBe(
			"'abc1' 'abc2' 'dbc1' 'self' 'xyz2' 'xyz3'",
		)
	})
})

describe('parseCspDirectives', () => {
	it('returns an empty object for an empty string', () => {
		expect(parseCspDirectives('')).toEqual({})
	})

	it('returns an object with parsed directives', () => {
		const directives = parseCspDirectives(
			'child-src a1 a2; connect-src b; default-src c1 c2 c3; font-src d',
		)

		expect(directives).toEqual({
			'child-src': 'a1 a2',
			'connect-src': 'b',
			'default-src': 'c1 c2 c3',
			'font-src': 'd',
		})
	})
})

describe('patchHeaders', () => {
	it('does not set csp header if no hashes nor settings are provided', () => {
		const headers = new Headers()
		const pageHashes = { scripts: new Set<string>(), styles: new Set<string>() }
		const settings = {}

		const patchedHeaders = patchHeaders(headers, pageHashes, settings)
		expect(patchedHeaders.has('content-security-policy')).toBe(false)
	})

	it('does not set csp header if no contentSecurityPolicy option is set', () => {
		const headers = new Headers()
		const pageHashes = {
			scripts: new Set<string>(['abc1', 'xyz2']),
			styles: new Set<string>(['dbc1', 'xyz3', 'abc2']),
		}
		const settings: SecurityHeadersOptions = {
			/* contentSecurityPolicy: {} */
		}

		const patchedHeaders = patchHeaders(headers, pageHashes, settings)
		expect(patchedHeaders.has('content-security-policy')).toBe(false)
	})

	it('sets csp header based on settings', () => {
		const headers = new Headers()
		const pageHashes = { scripts: new Set<string>(), styles: new Set<string>() }
		const settings: SecurityHeadersOptions = {
			contentSecurityPolicy: {
				cspDirectives: {
					'form-action': "'self'",
					'frame-ancestors': "'none'",
				},
			},
		}

		const patchedHeaders = patchHeaders(headers, pageHashes, settings)
		expect(patchedHeaders.get('content-security-policy')).toBe(
			"form-action 'self'; frame-ancestors 'none'; script-src 'none'; style-src 'none'",
		)
	})

	it('sets csp header based on hashes', () => {
		const headers = new Headers()
		const pageHashes = {
			scripts: new Set<string>(['abc1', 'xyz2']),
			styles: new Set<string>(['dbc1', 'xyz3', 'abc2']),
		}
		const settings: SecurityHeadersOptions = { contentSecurityPolicy: {} }

		const patchedHeaders = patchHeaders(headers, pageHashes, settings)
		expect(patchedHeaders.get('content-security-policy')).toBe(
			"script-src 'self' 'abc1' 'xyz2'; style-src 'self' 'abc2' 'dbc1' 'xyz3'",
		)
	})

	it('merges existing csp header with dynamically provided hashes & config', () => {
		const headers = new Headers({
			'content-security-policy':
				"base-uri 'none'; require-trusted-types-for 'script'",
		})
		const pageHashes = {
			scripts: new Set<string>(['abc1', 'xyz2']),
			styles: new Set<string>(['dbc1', 'xyz3', 'abc2']),
		}
		const settings: SecurityHeadersOptions = {
			contentSecurityPolicy: {
				cspDirectives: {
					'form-action': "'self'",
					'frame-ancestors': "'none'",
				},
			},
		}

		const patchedHeaders = patchHeaders(headers, pageHashes, settings)
		expect(patchedHeaders.get('content-security-policy')).toBe(
			"base-uri 'none'; form-action 'self'; frame-ancestors 'none'; require-trusted-types-for 'script'; script-src 'self' 'abc1' 'xyz2'; style-src 'self' 'abc2' 'dbc1' 'xyz3'",
		)
	})
})
