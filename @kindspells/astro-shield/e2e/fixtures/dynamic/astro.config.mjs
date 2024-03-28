/*
 * SPDX-FileCopyrightText: 2024 KindSpells Labs S.L.
 *
 * SPDX-License-Identifier: MIT
 */

import { shield } from '@kindspells/astro-shield'
import node from '@astrojs/node'
import { defineConfig } from 'astro/config'

/**
 * @typedef {{ -readonly [key in keyof T]: T[key] }} Mutable<T>
 * @template {any} T
 */

// https://astro.build/config
export default defineConfig({
	output: 'server',
	trailingSlash: 'always',
	adapter: node({ mode: 'standalone' }),
	integrations: [
		shield({
			enableStatic_SRI: false,
			enableMiddleware_SRI: true,
		}),
	],
})
