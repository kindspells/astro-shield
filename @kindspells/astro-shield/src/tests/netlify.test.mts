import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

import type { NetlifyHeadersRawConfig } from '../netlify.mts'
import {
	buildNetlifyHeadersConfig,
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
			{ headerName: 'X-Frame-Options', value: 'DENY' },
			{ headerName: 'X-XSS-Protection', value: '1; mode=block' },
		],
	},
	{
		path: '/es/index.html',
		entries: [
			{ headerName: 'X-Frame-Options', value: 'DENY' },
			{ headerName: 'X-XSS-Protection', value: '1; mode=block' },
		],
	},
] satisfies NetlifyHeadersRawConfig['entries']

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
			{
				perPageSriHashes: new Map([
					['index.html', { scripts: new Set(), styles: new Set() }],
				]),
			},
		)

		expect(config.entries.length).toBe(0)
	})

	it('creates a basic csp config with resource hashes', () => {
		const config = buildNetlifyHeadersConfig(
			{ contentSecurityPolicy: {} },
			{
				perPageSriHashes: new Map([
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
			},
		)

		expect(config).toEqual({
			indentWith: '\t',
			entries: [
				{
					path: '/onlyscripts.html',
					entries: [
						{
							headerName: 'content-security-policy',
							value:
								"script-src 'self' 'sha256-071spvYLMvnwaR0H7M2dfK0enB0cGtydTbgJkdoWq7c=' 'sha256-KWrCkmqpW9eWGwZRBZ9KqXsoHtAbAH/zPJvmUhsMKpA='; style-src 'none'",
						},
					],
				},
				{
					path: '/onlystyles.html',
					entries: [
						{
							headerName: 'content-security-policy',
							value:
								"script-src 'none'; style-src 'self' 'sha256-VC84dQdO3Mo7nZIRaNTJgrqPQ0foHI8gdp/DS+e9/lk=' 'sha256-iwd3GNfA+kImEozakD3ZZQSZ8VVb3MFBOhJH6dEMnDE='",
						},
					],
				},
				{
					path: '/scriptsandstyles.html',
					entries: [
						{
							headerName: 'content-security-policy',
							value:
								"script-src 'self' 'sha256-071spvYLMvnwaR0H7M2dfK0enB0cGtydTbgJkdoWq7c=' 'sha256-KWrCkmqpW9eWGwZRBZ9KqXsoHtAbAH/zPJvmUhsMKpA='; style-src 'self' 'sha256-VC84dQdO3Mo7nZIRaNTJgrqPQ0foHI8gdp/DS+e9/lk=' 'sha256-iwd3GNfA+kImEozakD3ZZQSZ8VVb3MFBOhJH6dEMnDE='",
						},
					],
				},
				{
					path: '/nothing.html',
					entries: [
						{
							headerName: 'content-security-policy',
							value: "script-src 'none'; style-src 'none'",
						},
					],
				},
			],
		} satisfies NetlifyHeadersRawConfig)
	})
})
