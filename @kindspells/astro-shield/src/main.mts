/*
 * SPDX-FileCopyrightText: 2024 KindSpells Labs S.L.
 *
 * SPDX-License-Identifier: MIT
 */

import { fileURLToPath } from 'node:url'

import type { AstroIntegration } from 'astro'

import { getAstroConfigSetup, processStaticFiles } from '#as/core'
import type {
	SecurityHeadersOptions,
	ShieldOptions,
	SRIOptions,
} from './types.mts'

type AstroHooks = AstroIntegration['hooks']

const getAstroBuildDone = (
	sri: Required<SRIOptions>,
	securityHeaders: SecurityHeadersOptions | undefined,
): NonNullable<AstroHooks['astro:build:done']> =>
	(async ({ dir, logger }) =>
		await processStaticFiles(logger, {
			distDir: fileURLToPath(dir),
			sri,
			securityHeaders,
		})) satisfies NonNullable<AstroHooks['astro:build:done']>

const logWarn = (msg: string): void =>
	console.warn(`\nWARNING (@kindspells/astro-shield):\n\t${msg}\n`)

// Integration
// -----------------------------------------------------------------------------
export const shield = ({
	enableMiddleware_SRI,
	enableStatic_SRI,
	sriHashesModule,
	securityHeaders,
	sri,
}: ShieldOptions): AstroIntegration => {
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

	return {
		name: '@kindspells/astro-shield',
		hooks: {
			...(_sri.enableStatic === true
				? {
						'astro:build:done': getAstroBuildDone(_sri, securityHeaders),
					}
				: undefined),
			...(_sri.enableMiddleware === true
				? {
						'astro:config:setup': getAstroConfigSetup(_sri, securityHeaders),
					}
				: undefined),
		},
	} satisfies AstroIntegration
}

export default shield
