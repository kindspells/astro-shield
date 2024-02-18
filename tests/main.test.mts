import { describe, expect, it } from 'vitest'

import defaultIntegrationExport, { sriCSP } from '../main.mjs'

describe('sriCSP', () => {
	it('is exported as default', () => {
		expect(defaultIntegrationExport).toBe(sriCSP)
		expect(sriCSP).toBeInstanceOf(Function)
	})

	it('returns a valid AstroIntegration object', () => {
		const integration = sriCSP({})

		expect(Object.keys(integration).sort()).toEqual(['hooks', 'name'])
		expect(integration.name).toBe('astro-sri-csp')

		expect(Object.keys(integration.hooks).sort()).toEqual(['astro:build:done'])
		expect(integration.hooks['astro:build:done']).toBeInstanceOf(Function)
	})
})
