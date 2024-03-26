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
	securityHeaders,
}) => {
	if (sriHashesModule && enableStatic_SRI === false) {
		console.warn(
			'\nWARNING (@kindspells/astro-shield):\n\t`sriHashesModule` is ignored when `enableStatic_SRI` is `false`\n',
		)
	}

	/**
	 * @param {boolean} enableMiddleware_SRI
	 * @returns {NonNullable<AstroHooks['astro:build:done']>}
	 */
	const getAstroBuildDone =
		enableMiddleware_SRI =>
		/** @satisfies {NonNullable<AstroHooks['astro:build:done']>} */
		async ({ dir, logger }) =>
			await processStaticFiles(logger, {
				distDir: fileURLToPath(dir),
				sriHashesModule,
				enableMiddleware_SRI,
			})

	return /** @satisfies {AstroIntegration} */ {
		name: '@kindspells/astro-shield',
		hooks: {
			...((enableStatic_SRI ?? true) === true
				? {
						'astro:build:done': getAstroBuildDone(
							enableMiddleware_SRI ?? false,
						),
					}
				: undefined),
			...(enableMiddleware_SRI === true
				? {
						'astro:config:setup': getAstroConfigSetup(
							enableStatic_SRI ?? true,
							sriHashesModule,
							securityHeaders,
						),
					}
				: undefined),
		},
	}
}

export default shield
