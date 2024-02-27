import { describe, expect, it } from 'vitest'

import defaultIntegrationExport, { shield } from '../main.mjs'

describe('sriCSP', () => {
	it('is exported as default', () => {
		expect(defaultIntegrationExport).toBe(shield)
		expect(shield).toBeInstanceOf(Function)
	})

	it('returns a valid AstroIntegration object', () => {
		const integration = shield({})

		expect(Object.keys(integration).sort()).toEqual(['hooks', 'name'])
		expect(integration.name).toBe('@kindspells/astro-shield')

		expect(Object.keys(integration.hooks).sort()).toEqual(['astro:build:done'])
		expect(integration.hooks['astro:build:done']).toBeInstanceOf(Function)
	})
})
