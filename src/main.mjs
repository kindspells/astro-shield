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
 * @typedef {import('./main.d.ts').SRIOptions} SRIOptions
 * @typedef {import('./main.d.ts').ShieldOptions} ShieldOptions
 */

/**
 * @param {Required<SRIOptions>} sri
 * @returns {NonNullable<AstroHooks['astro:build:done']>}
 */
const getAstroBuildDone =
	sri =>
	/** @satisfies {NonNullable<AstroHooks['astro:build:done']>} */
	async ({ dir, logger }) =>
		await processStaticFiles(logger, {
			distDir: fileURLToPath(dir),
			sri,
		})

/** @param {string} msg */
const logWarn = msg =>
	console.warn(`\nWARNING (@kindspells/astro-shield):\n\t${msg}\n`)

// Integration
// -----------------------------------------------------------------------------
/**
 * @param {ShieldOptions} sriCspOptions
 * @returns {AstroIntegration}
 */
export const shield = ({
	enableMiddleware_SRI,
	enableStatic_SRI,
	sriHashesModule,
	securityHeaders,
	sri,
}) => {
	// TODO: Remove deprecated options in a future release
	if (enableMiddleware_SRI !== undefined) {
		logWarn(
			'`enableMiddleware_SRI` is deprecated, use `sri.enableMiddleware` instead',
		)
	}
	if (enableStatic_SRI !== undefined) {
		logWarn('`enableStatic_SRI` is deprecated, use `sri.enableStatic` instead')
	}
	if (sriHashesModule !== undefined) {
		logWarn('`sriHashesModule` is deprecated, use `sri.hashesModule` instead')
	}

	// We need to merge the deprecated options into the new object
	const _sri = /** @satisfies {Required<SRIOptions>} */ {
		enableMiddleware: sri?.enableMiddleware ?? enableMiddleware_SRI ?? false,
		enableStatic: sri?.enableStatic ?? enableStatic_SRI ?? true,
		hashesModule: sri?.hashesModule ?? sriHashesModule,

		allowInlineScripts: sri?.allowInlineScripts ?? 'all',
		allowInlineStyles: sri?.allowInlineStyles ?? 'all',

		scriptsAllowListUrls: sri?.scriptsAllowListUrls ?? [],
		stylesAllowListUrls: sri?.stylesAllowListUrls ?? [],
	}

	if (_sri.hashesModule && _sri.enableStatic === false) {
		logWarn('`sriHashesModule` is ignored when `enableStatic_SRI` is `false`')
	}

	return /** @satisfies {AstroIntegration} */ {
		name: '@kindspells/astro-shield',
		hooks: {
			...(_sri.enableStatic === true
				? {
						'astro:build:done': getAstroBuildDone(_sri),
					}
				: undefined),
			...(_sri.enableMiddleware === true
				? {
						'astro:config:setup': getAstroConfigSetup(_sri, securityHeaders),
					}
				: undefined),
		},
	}
}

export default shield
