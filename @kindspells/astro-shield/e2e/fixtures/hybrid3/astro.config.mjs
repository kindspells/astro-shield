/*
 * SPDX-FileCopyrightText: 2024 KindSpells Labs S.L.
 *
 * SPDX-License-Identifier: MIT
 */

import { resolve } from 'node:path'
import node from '@astrojs/node'
import { shield } from '@kindspells/astro-shield'
import { defineConfig } from 'astro/config'

/**
 * @typedef {{ -readonly [key in keyof T]: T[key] }} Mutable<T>
 * @template {any} T
 */

const rootDir = new URL('.', import.meta.url).pathname
const sriHashesModule = resolve(rootDir, 'src', 'generated', 'sri.mjs')

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
				hashesModule: sriHashesModule,
				scriptsAllowListUrls: [
					'https://code.jquery.com/jquery-3.7.1.slim.min.js',
					'https://code.jquery.com/ui/1.13.2/jquery-ui.min.js',
				],
			},
			securityHeaders: {
				contentSecurityPolicy: {
					cspDirectives: {
						'default-src': "'none'",
						'frame-ancestors': "'none'",
					},
				},
			},
		}),
	],
	vite: {
		build: { assetsInlineLimit: 1024 },
	},
})
