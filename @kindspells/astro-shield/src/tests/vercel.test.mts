import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

import type { VercelConfig } from '../vercel.mts'
import {
	buildVercelConfig,
	mergeVercelConfig,
	parseVercelConfig,
	readVercelConfigFile,
	serializeVercelConfig,
} from '../vercel.mts'
import type { Logger } from '../types.mts'

describe('parseVercelConfig', () => {
	it('parses a valid minimal Vercel config', () => {
		const config_a = '{"version":3}'
		expect(parseVercelConfig(console, config_a)).toEqual({ version: 3 })

		const config_b = '{"version":3, "routes": []}'
		expect(parseVercelConfig(console, config_b)).toEqual({
			version: 3,
			routes: [],
		})
	})

	it('throws an error when version field is missing', () => {
		const config = '{}'
		expect(() => parseVercelConfig(console, config)).toThrowError(
			'Invalid Vercel config: missing "version" field',
		)
	})

	// TODO: This test should be removed once we improve versions handling
	it('logs a warning message when version field is not 3', () => {
		const config = '{"version":2}'

		let warnCalls = 0
		let lastWarnMsg = ''
		const logger: Logger = {
			info: () => {},
			warn: (msg: string) => {
				warnCalls += 1
				lastWarnMsg = msg
			},
			error: () => {},
		}

		parseVercelConfig(logger, config)

		expect(warnCalls).toBe(1)
		expect(lastWarnMsg).toBe(
			'Expected Vercel config version 3, but got version 2',
		)
	})
})

describe('readVercelConfigFile', () => {
	const testsDir = new URL('.', import.meta.url).pathname

	it('reads a valid Vercel config file', async () => {
		const config = await readVercelConfigFile(
			console,
			resolve(testsDir, 'fixtures', 'vercel_config.json'),
		)

		expect(config).toEqual({
			version: 3,
			routes: [
				{
					src: '/es',
					headers: {
						Location: '/es/',
					},
					status: 308,
				},
				{
					src: '/new',
					headers: {
						Location: '/new/',
					},
					status: 308,
				},
				{
					src: '^/_astro/(.*)$',
					headers: {
						'cache-control': 'public, max-age=31536000, immutable',
					},
					continue: true,
				},
				{
					handle: 'filesystem',
				},
			],
		})
	})
})

describe('buildVercelConfig', () => {
	it('creates an "empty" config when there is no info to construct headers', () => {
		const config = buildVercelConfig(
			{},
			{},
			new Map([['index.html', { scripts: new Set(), styles: new Set() }]]),
		)

		expect(config).toEqual({
			version: 3,
			routes: [],
		})
	})

	it('creates a basic csp config with resource hashes', () => {
		const config = buildVercelConfig(
			{},
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
			version: 3,
			routes: [
				{
					src: '^/nothing\\.html$',
					headers: {
						'content-security-policy': "script-src 'none'; style-src 'none'",
					},
					continue: true,
				},
				{
					src: '^/onlyscripts\\.html$',
					headers: {
						'content-security-policy':
							"script-src 'self' 'sha256-071spvYLMvnwaR0H7M2dfK0enB0cGtydTbgJkdoWq7c=' 'sha256-KWrCkmqpW9eWGwZRBZ9KqXsoHtAbAH/zPJvmUhsMKpA='; style-src 'none'",
					},
					continue: true,
				},
				{
					src: '^/onlystyles\\.html$',
					headers: {
						'content-security-policy':
							"script-src 'none'; style-src 'self' 'sha256-VC84dQdO3Mo7nZIRaNTJgrqPQ0foHI8gdp/DS+e9/lk=' 'sha256-iwd3GNfA+kImEozakD3ZZQSZ8VVb3MFBOhJH6dEMnDE='",
					},
					continue: true,
				},
				{
					src: '^/scriptsandstyles\\.html$',
					headers: {
						'content-security-policy':
							"script-src 'self' 'sha256-071spvYLMvnwaR0H7M2dfK0enB0cGtydTbgJkdoWq7c=' 'sha256-KWrCkmqpW9eWGwZRBZ9KqXsoHtAbAH/zPJvmUhsMKpA='; style-src 'self' 'sha256-VC84dQdO3Mo7nZIRaNTJgrqPQ0foHI8gdp/DS+e9/lk=' 'sha256-iwd3GNfA+kImEozakD3ZZQSZ8VVb3MFBOhJH6dEMnDE='",
					},
					continue: true,
				},
			],
		} satisfies VercelConfig)
	})

	it('respects the "trailingSlash=always" Astro option', () => {
		const config = buildVercelConfig(
			{ trailingSlash: 'always' },
			{ contentSecurityPolicy: {} },
			new Map([
				[
					'nested/index.html',
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
				[
					'notindex.html',
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
			]),
		)

		expect(config).toEqual({
			version: 3,
			routes: [
				{
					src: '^/nested/$',
					headers: {
						'content-security-policy':
							"script-src 'self' 'sha256-071spvYLMvnwaR0H7M2dfK0enB0cGtydTbgJkdoWq7c=' 'sha256-KWrCkmqpW9eWGwZRBZ9KqXsoHtAbAH/zPJvmUhsMKpA='; style-src 'self' 'sha256-VC84dQdO3Mo7nZIRaNTJgrqPQ0foHI8gdp/DS+e9/lk=' 'sha256-iwd3GNfA+kImEozakD3ZZQSZ8VVb3MFBOhJH6dEMnDE='",
					},
					continue: true,
				},
				{
					src: '^/nested/index\\.html$',
					headers: {
						'content-security-policy':
							"script-src 'self' 'sha256-071spvYLMvnwaR0H7M2dfK0enB0cGtydTbgJkdoWq7c=' 'sha256-KWrCkmqpW9eWGwZRBZ9KqXsoHtAbAH/zPJvmUhsMKpA='; style-src 'self' 'sha256-VC84dQdO3Mo7nZIRaNTJgrqPQ0foHI8gdp/DS+e9/lk=' 'sha256-iwd3GNfA+kImEozakD3ZZQSZ8VVb3MFBOhJH6dEMnDE='",
					},
					continue: true,
				},
				{
					src: '^/notindex\\.html$',
					headers: {
						'content-security-policy':
							"script-src 'self' 'sha256-071spvYLMvnwaR0H7M2dfK0enB0cGtydTbgJkdoWq7c=' 'sha256-KWrCkmqpW9eWGwZRBZ9KqXsoHtAbAH/zPJvmUhsMKpA='; style-src 'self' 'sha256-VC84dQdO3Mo7nZIRaNTJgrqPQ0foHI8gdp/DS+e9/lk=' 'sha256-iwd3GNfA+kImEozakD3ZZQSZ8VVb3MFBOhJH6dEMnDE='",
					},
					continue: true,
				},
			],
		})
	})

	it('respects the "trailingSlash=never" Astro option', () => {
		const config = buildVercelConfig(
			{ trailingSlash: 'never' },
			{ contentSecurityPolicy: {} },
			new Map([
				[
					'nested/index.html',
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
				[
					'notindex.html',
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
			]),
		)

		expect(config).toEqual({
			version: 3,
			routes: [
				{
					src: '^/nested$',
					headers: {
						'content-security-policy':
							"script-src 'self' 'sha256-071spvYLMvnwaR0H7M2dfK0enB0cGtydTbgJkdoWq7c=' 'sha256-KWrCkmqpW9eWGwZRBZ9KqXsoHtAbAH/zPJvmUhsMKpA='; style-src 'self' 'sha256-VC84dQdO3Mo7nZIRaNTJgrqPQ0foHI8gdp/DS+e9/lk=' 'sha256-iwd3GNfA+kImEozakD3ZZQSZ8VVb3MFBOhJH6dEMnDE='",
					},
					continue: true,
				},
				{
					src: '^/nested/index\\.html$',
					headers: {
						'content-security-policy':
							"script-src 'self' 'sha256-071spvYLMvnwaR0H7M2dfK0enB0cGtydTbgJkdoWq7c=' 'sha256-KWrCkmqpW9eWGwZRBZ9KqXsoHtAbAH/zPJvmUhsMKpA='; style-src 'self' 'sha256-VC84dQdO3Mo7nZIRaNTJgrqPQ0foHI8gdp/DS+e9/lk=' 'sha256-iwd3GNfA+kImEozakD3ZZQSZ8VVb3MFBOhJH6dEMnDE='",
					},
					continue: true,
				},
				{
					src: '^/notindex\\.html$',
					headers: {
						'content-security-policy':
							"script-src 'self' 'sha256-071spvYLMvnwaR0H7M2dfK0enB0cGtydTbgJkdoWq7c=' 'sha256-KWrCkmqpW9eWGwZRBZ9KqXsoHtAbAH/zPJvmUhsMKpA='; style-src 'self' 'sha256-VC84dQdO3Mo7nZIRaNTJgrqPQ0foHI8gdp/DS+e9/lk=' 'sha256-iwd3GNfA+kImEozakD3ZZQSZ8VVb3MFBOhJH6dEMnDE='",
					},
					continue: true,
				},
			],
		})
	})
})

describe('mergeVercelConfig', () => {
	it('merges two Vercel configs', () => {
		const base: VercelConfig = {
			version: 3,
			routes: [
				{
					src: '/nothing.html',
					headers: {
						'content-security-policy': "script-src 'none'; style-src 'none'",
					},
				},
			],
		}
		const patch: VercelConfig = {
			version: 3,
			routes: [
				{
					src: '/onlystyles.html',
					headers: {
						'content-security-policy':
							"script-src 'none'; style-src 'self' 'sha256-VC84dQdO3Mo7nZIRaNTJgrqPQ0foHI8gdp/DS+e9/lk=' 'sha256-iwd3GNfA+kImEozakD3ZZQSZ8VVb3MFBOhJH6dEMnDE='",
					},
				},
			],
		}

		const merged = mergeVercelConfig(base, patch)

		expect(merged).toEqual({
			version: 3,
			routes: [
				{
					src: '/onlystyles.html',
					headers: {
						'content-security-policy':
							"script-src 'none'; style-src 'self' 'sha256-VC84dQdO3Mo7nZIRaNTJgrqPQ0foHI8gdp/DS+e9/lk=' 'sha256-iwd3GNfA+kImEozakD3ZZQSZ8VVb3MFBOhJH6dEMnDE='",
					},
				},
				{
					src: '/nothing.html',
					headers: {
						'content-security-policy': "script-src 'none'; style-src 'none'",
					},
				},
			],
		})
	})
})

describe('serializeVercelConfig', () => {
	it('serializes a Vercel config', () => {
		const serialized = serializeVercelConfig({
			version: 3,
			routes: [
				{
					src: '/nothing.html',
					headers: {
						'content-security-policy': "script-src 'none'; style-src 'none'",
					},
				},
			],
		})

		expect(serialized).toBe(`{
	"version": 3,
	"routes": [
		{
			"src": "/nothing.html",
			"headers": {
				"content-security-policy": "script-src 'none'; style-src 'none'"
			}
		}
	]
}`)
	})
})
