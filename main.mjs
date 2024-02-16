/*
 * SPDX-FileCopyrightText: 2024 KindSpells Labs S.L.
 *
 * SPDX-License-Identifier: MIT
 */

import { fileURLToPath } from 'node:url'
import { generateSRIHashes } from './core.mjs'

/**
 * @param {import('./main.d.ts').SriCspOptions} sriCspOptions
 * @returns {import('./main.d.ts').Integration}
 */
export const sriCSP =
	sriCspOptions => /** @satisfies {import('astro').AstroIntegration} */ ({
		name: 'scp-sri-postbuild',
		hooks: {
			'astro:build:done': async ({ dir, logger }) =>
				await generateSRIHashes(logger, {
					distDir: fileURLToPath(dir),
					sriHashesModule: sriCspOptions.sriHashesModule,
				}),
		},
	})

export default sriCSP
