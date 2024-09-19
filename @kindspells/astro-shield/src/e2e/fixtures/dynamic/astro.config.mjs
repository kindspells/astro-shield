/*
 * SPDX-FileCopyrightText: 2024 KindSpells Labs S.L.
 *
 * SPDX-License-Identifier: MIT
 */

import node from '@astrojs/node'
import { shield } from '@kindspells/astro-shield'
import { defineConfig } from 'astro/config'

// https://astro.build/config
export default defineConfig({
	output: 'server',
	trailingSlash: 'always',
	adapter: node({ mode: 'standalone' }),
	integrations: [
		shield({
			sri: {
				enableStatic: false,
				enableMiddleware: true,
			},
		}),
	],
})
