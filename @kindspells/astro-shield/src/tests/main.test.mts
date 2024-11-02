/*
 * SPDX-FileCopyrightText: 2024 KindSpells Labs S.L.
 *
 * SPDX-License-Identifier: MIT
 */

import type { AstroIntegration } from 'astro'
import { describe, expect, it } from 'vitest'

import defaultIntegrationExport, { shield } from '../main.mts'

describe('sriCSP', () => {
	const defaultIntegrationKeys = [
		'astro:build:done',
		'astro:config:setup',
	] as Readonly<['astro:build:done', 'astro:config:setup']>

	const checkIntegration = (
		integration: AstroIntegration,
		keys: Readonly<
			(keyof AstroIntegration['hooks'])[]
		> = defaultIntegrationKeys,
	) => {
		expect(Object.keys(integration).sort()).toEqual(['hooks', 'name'])
		expect(integration.name).toBe('@kindspells/astro-shield')

		const sortedKeys = keys.slice().sort() // TODO: use toSorted when widely available
		expect(Object.keys(integration.hooks).sort()).toEqual(sortedKeys)
		for (const key of sortedKeys) {
			expect(integration.hooks[key]).toBeTruthy()
			expect(integration.hooks[key]).toBeInstanceOf(Function)
		}
	}

	it('is exported as default', () => {
		expect(defaultIntegrationExport).toBe(shield)
		expect(shield).toBeInstanceOf(Function)
	})

	it('returns a valid AstroIntegration object for default config', () => {
		const integration = shield({})
		checkIntegration(integration)
	})

	it('returns a valid AstroIntegration object for almost-default config', () => {
		const integration = shield({ sri: { enableStatic: true } })
		checkIntegration(integration)
	})

	it('returns an integration even when we disable all features', () => {
		const integration = shield({ sri: { enableStatic: false } })

		// NOTE: it is too much work to verify that those hooks will do nothing
		checkIntegration(integration, defaultIntegrationKeys)
	})

	it('returns hooks for static & dynamic content when we enable middleware', () => {
		const integration = shield({ sri: { enableMiddleware: true } })
		checkIntegration(integration, defaultIntegrationKeys)
	})

	it('returns hooks only for dynamic content when we enable middleware and disable static sri', () => {
		const integration = shield({
			sri: {
				enableStatic: false,
				enableMiddleware: true,
			},
		})
		checkIntegration(integration, defaultIntegrationKeys)
	})

	it('removes build:done from base config when delayTransform=true', () => {
		const integration = shield({
			delayTransform: true,
		})
		checkIntegration(integration, ['astro:config:setup'])
	})

	it('keeps build:done in base config when delayTransform=false', () => {
		const integration = shield({
			delayTransform: false,
		})
		checkIntegration(integration, ['astro:build:done', 'astro:config:setup'])
	})
})
