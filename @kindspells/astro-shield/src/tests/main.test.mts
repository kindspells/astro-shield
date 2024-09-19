/*
 * SPDX-FileCopyrightText: 2024 KindSpells Labs S.L.
 *
 * SPDX-License-Identifier: MIT
 */

import type { AstroIntegration } from 'astro'
import { describe, expect, it } from 'vitest'

import defaultIntegrationExport, { shield } from '../main.mts'

describe('sriCSP', () => {
	it('is exported as default', () => {
		expect(defaultIntegrationExport).toBe(shield)
		expect(shield).toBeInstanceOf(Function)
	})

	const checkIntegration = (
		integration: AstroIntegration,
		keys: (keyof AstroIntegration['hooks'])[] = ['astro:build:done' as const],
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
		const integration = shield({ sri: { enableStatic: true } })
		checkIntegration(integration)
	})

	it('returns an "empty" integration when we disable all features', () => {
		const integration = shield({ sri: { enableStatic: false } })
		checkIntegration(integration, [])
	})

	it('returns hooks for static & dynamic content when we enable middleware', () => {
		const integration = shield({ sri: { enableMiddleware: true } })
		checkIntegration(integration, ['astro:build:done', 'astro:config:setup'])
	})

	it('returns hooks only for dynamic content when we enable middleware and disable static sri', () => {
		const integration = shield({
			sri: {
				enableStatic: false,
				enableMiddleware: true,
			},
		})
		checkIntegration(integration, ['astro:config:setup'])
	})
})
