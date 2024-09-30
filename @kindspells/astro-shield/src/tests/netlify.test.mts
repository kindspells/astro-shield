import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

import type { NetlifyHeadersRawConfig } from '../netlify.mts'
import {
	buildNetlifyHeadersConfig,
	comparePathEntries,
	comparePathEntriesSimplified,
	mergeNetlifyHeadersConfig,
	parseNetlifyHeadersConfig,
	readNetlifyHeadersFile,
	serializeNetlifyHeadersConfig,
} from '../netlify.mts'

const testEntries = [
	{ comment: '# This is a test config file' },
	'',
	{
		path: '/index.html',
		entries: [
			{ comment: '# Nested Comment' },
			{ key: 'X-Frame-Options', value: 'DENY' },
			{ key: 'X-XSS-Protection', value: '1; mode=block' },
		],
	},
	{
		path: '/es/index.html',
		entries: [
			{ key: 'X-Frame-Options', value: 'DENY' },
			{ key: 'X-XSS-Protection', value: '1; mode=block' },
		],
	},
] satisfies NetlifyHeadersRawConfig['entries']

describe('comparePathEntries', () => {
	it.each([
		[{ comment: 'Comment A' }, { comment: 'Comment B' }],
		[{ comment: 'Comment A' }, { key: 'X-Frame-Options', value: 'DENY' }],
		[{ key: 'X-Frame-Options', value: 'DENY' }, { comment: 'Comment A' }],
	] as const)('returns 0 if there is any comment', (entryA, entryB) => {
		expect(comparePathEntries(entryA, entryB)).toBe(0)
	})

	it.each([
		[
			{ key: 'Authorization', value: 'Bearer 0123456789abcdef' },
			{ key: 'Authorization', value: 'Bearer 0123456789abcdef' },
			0,
		],
		[
			{ key: 'Authorization', value: 'Bearer 0123456789abcdef' },
			{ key: 'X-Frame-Options', value: 'DENY' },
			-1,
		],
		[
			{ key: 'X-Frame-Options', value: 'DENY' },
			{ key: 'Authorization', value: 'Bearer 0123456789abcdef' },
			1,
		],
		[
			{ key: 'X-Frame-Options', value: 'ALLOW' },
			{ key: 'X-Frame-Options', value: 'DENY' },
			-1,
		],
		[
			{ key: 'X-Frame-Options', value: 'DENY' },
			{ key: 'X-Frame-Options', value: 'ALLOW' },
			1,
		],
	] as const)(
		'compares headers by name and value',
		(entryA, entryB, result) => {
			expect(comparePathEntries(entryA, entryB)).toBe(result)
		},
	)
})

describe('comparePathEntriesSimplified', () => {
	it.each([
		[{ comment: 'Comment A' }, { comment: 'Comment B' }],
		[{ comment: 'Comment A' }, { key: 'X-Frame-Options', value: 'DENY' }],
		[{ key: 'X-Frame-Options', value: 'DENY' }, { comment: 'Comment A' }],
	] as const)('returns 0 if there is any comment', (entryA, entryB) => {
		expect(comparePathEntriesSimplified(entryA, entryB)).toBe(0)
	})

	it.each([
		[
			{ key: 'Authorization', value: 'Bearer 0123456789abcdef' },
			{ key: 'Authorization', value: 'Bearer 0123456789abcdef' },
			0,
		],
		[
			{ key: 'Authorization', value: 'Bearer 0123456789abcdef' },
			{ key: 'X-Frame-Options', value: 'DENY' },
			-1,
		],
		[
			{ key: 'X-Frame-Options', value: 'DENY' },
			{ key: 'Authorization', value: 'Bearer 0123456789abcdef' },
			1,
		],
		[
			{ key: 'X-Frame-Options', value: 'ALLOW' },
			{ key: 'X-Frame-Options', value: 'DENY' },
			0,
		],
		[
			{ key: 'X-Frame-Options', value: 'DENY' },
			{ key: 'X-Frame-Options', value: 'ALLOW' },
			0,
		],
	] as const)(
		'compares headers by name and value',
		(entryA, entryB, result) => {
			expect(comparePathEntriesSimplified(entryA, entryB)).toBe(result)
		},
	)
})

describe('parseNetlifyHeadersConfig', () => {
	it('parses a valid config (tabs)', () => {
		const config = `# This is a test config file

/index.html
	# Nested Comment
	X-Frame-Options: DENY
	X-XSS-Protection: 1; mode=block
/es/index.html
	X-Frame-Options: DENY
	X-XSS-Protection: 1; mode=block
`
		const parsed = parseNetlifyHeadersConfig(config)
		expect(parsed).toEqual({
			indentWith: '\t',
			entries: testEntries,
		} satisfies NetlifyHeadersRawConfig)
	})

	it('parses a valid config (spaces)', () => {
		const config = `# This is a test config file

/index.html
  # Nested Comment
  X-Frame-Options: DENY
  X-XSS-Protection: 1; mode=block
/es/index.html
  X-Frame-Options: DENY
  X-XSS-Protection: 1; mode=block
`
		const parsed = parseNetlifyHeadersConfig(config)
		expect(parsed).toEqual({
			indentWith: '  ',
			entries: testEntries,
		} satisfies NetlifyHeadersRawConfig)
	})

	it('raises an error for empty page configs', () => {
		const config = `/index.html
  # Nested Comment
  X-Frame-Options: DENY
  X-XSS-Protection: 1; mode=block
/fr/index.html
/es/index.html
  X-Frame-Options: DENY
  X-XSS-Protection: 1; mode=block
`

		expect(() => parseNetlifyHeadersConfig(config)).toThrowError(
			'Bad syntax (line 5)',
		)
	})

	it('raises an error for changing indentation', () => {
		const config = `/index.html
  # Nested Comment
	X-Frame-Options: DENY
  X-XSS-Protection: 1; mode=block
`

		expect(() => parseNetlifyHeadersConfig(config)).toThrowError(
			'Unexpected indentation (line 2)',
		)
	})
})

describe('readNetlifyHeadersFile', () => {
	const testsDir = new URL('.', import.meta.url).pathname

	it('load and parses a valid config', async () => {
		const config = await readNetlifyHeadersFile(
			resolve(testsDir, 'fixtures', 'netlify_headers'),
		)

		expect(config).toEqual({
			indentWith: '\t',
			entries: testEntries,
		} satisfies NetlifyHeadersRawConfig)
	})
})

describe('serializeNetlifyHeadersConfig', () => {
	it('serializes the config structure into a correct string', () => {
		const serialized = serializeNetlifyHeadersConfig({
			indentWith: '\t',
			entries: testEntries,
		} satisfies NetlifyHeadersRawConfig)

		expect(serialized).toEqual(`# This is a test config file

/index.html
	# Nested Comment
	X-Frame-Options: DENY
	X-XSS-Protection: 1; mode=block
/es/index.html
	X-Frame-Options: DENY
	X-XSS-Protection: 1; mode=block
`)
	})
})

describe('buildNetlifyHeadersConfig', () => {
	it('creates an "empty" config when there is no info to construct headers', () => {
		const config = buildNetlifyHeadersConfig(
			{},
			new Map([['index.html', { scripts: new Set(), styles: new Set() }]]),
		)

		expect(config.entries.length).toBe(0)
	})

	it('creates a basic csp config with resource hashes', () => {
		const config = buildNetlifyHeadersConfig(
			{ contentSecurityPolicy: {} },
			new Map([
				[
					'onlyscripts.html',
					{
						scripts: new Set([
							'sha256-071spvYLMvnwaR0H7M2dfK0enB0cGtydTbgJkdoWq7c=',
							'sha256-KWrCkmqpW9eWGwZRBZ9KqXsoHtAbAH/zPJvmUhsMKpA=',
						]),
						styles: new Set(),
					},
				],
				[
					'onlystyles.html',
					{
						scripts: new Set(),
						styles: new Set([
							'sha256-VC84dQdO3Mo7nZIRaNTJgrqPQ0foHI8gdp/DS+e9/lk=',
							'sha256-iwd3GNfA+kImEozakD3ZZQSZ8VVb3MFBOhJH6dEMnDE=',
						]),
					},
				],
				[
					'scriptsandstyles.html',
					{
						scripts: new Set([
							'sha256-071spvYLMvnwaR0H7M2dfK0enB0cGtydTbgJkdoWq7c=',
							'sha256-KWrCkmqpW9eWGwZRBZ9KqXsoHtAbAH/zPJvmUhsMKpA=',
						]),
						styles: new Set([
							'sha256-VC84dQdO3Mo7nZIRaNTJgrqPQ0foHI8gdp/DS+e9/lk=',
							'sha256-iwd3GNfA+kImEozakD3ZZQSZ8VVb3MFBOhJH6dEMnDE=',
						]),
					},
				],
				['nothing.html', { scripts: new Set(), styles: new Set() }],
			]),
		)

		// It also orders the entries to ensure that we have a canonical order
		expect(config).toEqual({
			indentWith: '\t',
			entries: [
				{
					path: '/nothing.html',
					entries: [
						{
							key: 'content-security-policy',
							value: "script-src 'none'; style-src 'none'",
						},
					],
				},
				{
					path: '/onlyscripts.html',
					entries: [
						{
							key: 'content-security-policy',
							value:
								"script-src 'self' 'sha256-071spvYLMvnwaR0H7M2dfK0enB0cGtydTbgJkdoWq7c=' 'sha256-KWrCkmqpW9eWGwZRBZ9KqXsoHtAbAH/zPJvmUhsMKpA='; style-src 'none'",
						},
					],
				},
				{
					path: '/onlystyles.html',
					entries: [
						{
							key: 'content-security-policy',
							value:
								"script-src 'none'; style-src 'self' 'sha256-VC84dQdO3Mo7nZIRaNTJgrqPQ0foHI8gdp/DS+e9/lk=' 'sha256-iwd3GNfA+kImEozakD3ZZQSZ8VVb3MFBOhJH6dEMnDE='",
						},
					],
				},
				{
					path: '/scriptsandstyles.html',
					entries: [
						{
							key: 'content-security-policy',
							value:
								"script-src 'self' 'sha256-071spvYLMvnwaR0H7M2dfK0enB0cGtydTbgJkdoWq7c=' 'sha256-KWrCkmqpW9eWGwZRBZ9KqXsoHtAbAH/zPJvmUhsMKpA='; style-src 'self' 'sha256-VC84dQdO3Mo7nZIRaNTJgrqPQ0foHI8gdp/DS+e9/lk=' 'sha256-iwd3GNfA+kImEozakD3ZZQSZ8VVb3MFBOhJH6dEMnDE='",
						},
					],
				},
			],
		} satisfies NetlifyHeadersRawConfig)
	})

	it('creates a "double entry" for "index.html" files', () => {
		const config = buildNetlifyHeadersConfig(
			{ contentSecurityPolicy: {} },
			new Map([
				[
					'index.html',
					{
						scripts: new Set([
							'sha256-071spvYLMvnwaR0H7M2dfK0enB0cGtydTbgJkdoWq7c=',
						]),
						styles: new Set(),
					},
				],
				[
					'es/index.html',
					{
						scripts: new Set([
							'sha256-071spvYLMvnwaR0H7M2dfK0enB0cGtydTbgJkdoWq7c=',
						]),
						styles: new Set(),
					},
				],
				[
					'fakeindex.html',
					{
						scripts: new Set([
							'sha256-071spvYLMvnwaR0H7M2dfK0enB0cGtydTbgJkdoWq7c=',
						]),
						styles: new Set(),
					},
				],
			]),
		)

		const testEntries = [
			{
				key: 'content-security-policy',
				value:
					"script-src 'self' 'sha256-071spvYLMvnwaR0H7M2dfK0enB0cGtydTbgJkdoWq7c='; style-src 'none'",
			},
		]

		expect(config).toEqual({
			indentWith: '\t',
			entries: [
				{
					path: '/',
					entries: testEntries,
				},
				{
					path: '/es/',
					entries: testEntries,
				},
				{
					path: '/es/index.html',
					entries: testEntries,
				},
				{
					path: '/fakeindex.html',
					entries: testEntries,
				},
				{
					path: '/index.html',
					entries: testEntries,
				},
			],
		} satisfies NetlifyHeadersRawConfig)
	})
})

describe('mergeNetlifyHeadersConfig', () => {
	it('can merge two configs preserving the order', () => {
		const c1: NetlifyHeadersRawConfig = {
			indentWith: '\t',
			entries: [
				{
					path: '/a.html',
					entries: [{ key: 'X-Frame-Options', value: 'DENY' }],
				},
				{
					path: '/c.html',
					entries: [{ key: 'Cache-Control', value: 'no-cache' }],
				},
				{
					path: '/cc.html',
					entries: [], // empty on purpose
				},
				{
					path: '/d.html', // shared path
					entries: [
						{ key: 'Cache-Control', value: 'no-cache' },
						{ key: 'X-Frame-Options', value: 'DENY' },
					],
				},
			],
		}
		const c2: NetlifyHeadersRawConfig = {
			indentWith: '  ',
			entries: [
				{
					path: '/b.html',
					entries: [
						{
							key: 'content-security-policy',
							value: "script-src 'none'",
						},
					],
				},
				{
					path: '/d.html', // shared path
					entries: [
						{ key: 'X-Frame-Options', value: 'ALLOW' },
						{ key: 'X-XSS-Protection', value: '1; mode=block' },
					],
				},
			],
		}

		const merged = mergeNetlifyHeadersConfig(c1, c2)

		expect(merged).toEqual({
			indentWith: '\t',
			entries: [
				{
					path: '/a.html',
					entries: [{ key: 'X-Frame-Options', value: 'DENY' }],
				},
				{
					path: '/b.html',
					entries: [
						{
							key: 'content-security-policy',
							value: "script-src 'none'",
						},
					],
				},
				{
					path: '/c.html',
					entries: [{ key: 'Cache-Control', value: 'no-cache' }],
				},
				// cc.html is discarded for not having entries
				{
					path: '/d.html',
					entries: [
						{ key: 'Cache-Control', value: 'no-cache' }, // from c1
						{ key: 'X-Frame-Options', value: 'ALLOW' }, // overriden
						{ key: 'X-XSS-Protection', value: '1; mode=block' }, // from c2
					],
				},
			],
		} satisfies NetlifyHeadersRawConfig)
	})
})
