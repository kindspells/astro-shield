import type { AstroIntegration } from 'astro'
import { describe, expect, it } from 'vitest'

import defaultIntegrationExport, { shield } from '../src/main.mjs'

describe('sriCSP', () => {
	it('is exported as default', () => {
		expect(defaultIntegrationExport).toBe(shield)
		expect(shield).toBeInstanceOf(Function)
	})

	const checkIntegration = (
		integration: AstroIntegration,
		keys = ['astro:build:done'],
	) => {
		expect(Object.keys(integration).sort()).toEqual(['hooks', 'name'])
		expect(integration.name).toBe('@kindspells/astro-shield')

		const sortedKeys = keys.sort()
		expect(Object.keys(integration.hooks).sort()).toEqual(sortedKeys)
		for (const key of sortedKeys) {
			expect(integration.hooks[key]).toBeTruthy()
			expect(integration.hooks[key]).toBeInstanceOf(Function)
		}
	}

	it('returns a valid AstroIntegration object for default config', () => {
		const integration = shield({})
		checkIntegration(integration)
	})

	it('returns a valid AstroIntegration object for almost-default config', () => {
		const integration = shield({ enableStatic_SRI: true })
		checkIntegration(integration)
	})

	it('returns an "empty" integration when we disable all features', () => {
		const integration = shield({ enableStatic_SRI: false })
		checkIntegration(integration, [])
	})

	it('returns hooks for static & dynamic content when we enable middleware', () => {
		const integration = shield({ enableMiddleware_SRI: true })
		checkIntegration(integration, ['astro:build:done', 'astro:config:setup'])
	})

	it('returns hooks only for dynamic content when we enable middleware and disable static sri', () => {
		const integration = shield({
			enableStatic_SRI: false,
			enableMiddleware_SRI: true,
		})
		checkIntegration(integration, ['astro:config:setup'])
	})
})
