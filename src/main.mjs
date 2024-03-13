/*
 * SPDX-FileCopyrightText: 2024 KindSpells Labs S.L.
 *
 * SPDX-License-Identifier: MIT
 */

import { fileURLToPath } from 'node:url'
import { getAstroConfigSetup, processStaticFiles } from './core.mjs'

/**
 * @typedef {import('astro').AstroIntegration} AstroIntegration
 * @typedef {AstroIntegration['hooks']} AstroHooks
 * @typedef {import('./core.d.ts').MiddlewareHashes} MiddlewareHashes
 */

// Integration
// -----------------------------------------------------------------------------
/**
 * @param {import('./main.d.ts').ShieldOptions} sriCspOptions
 * @returns {AstroIntegration}
 */
export const shield = ({
	enableMiddleware_SRI,
	enableStatic_SRI,
	sriHashesModule,
}) => {
	const astroBuildDone =
		/** @satisfies {AstroHooks['astro:build:done']} */ async ({
			dir,
			logger,
		}) =>
			await processStaticFiles(logger, {
				distDir: fileURLToPath(dir),
				sriHashesModule,
			})

	return /** @satisfies {AstroIntegration} */ {
		name: '@kindspells/astro-shield',
		hooks: {
			...((enableStatic_SRI ?? true) === true
				? { 'astro:build:done': astroBuildDone }
				: undefined),
			...(enableMiddleware_SRI === true
				? {
						'astro:config:setup': getAstroConfigSetup(
							enableStatic_SRI ?? true,
							sriHashesModule,
						),
				  }
				: undefined),
		},
	}
}

export default shield
