/*
 * SPDX-FileCopyrightText: 2024 KindSpells Labs S.L.
 *
 * SPDX-License-Identifier: MIT
 */

import { resolve } from 'node:path'
import node from '@astrojs/node'
import { shield } from '@kindspells/astro-shield'
import { defineConfig } from 'astro/config'

const rootDir = new URL('.', import.meta.url).pathname
const hashesModule = resolve(rootDir, 'src', 'generated', 'sri.mjs')

// https://astro.build/config
export default defineConfig({
	output: 'hybrid',
	trailingSlash: 'always',
	adapter: node({ mode: 'standalone' }),
	integrations: [
		shield({
			sri: {
				enableStatic: true,
				enableMiddleware: true,
				hashesModule,
			},
		}),
	],
})
