/*
 * SPDX-FileCopyrightText: 2024 KindSpells Labs S.L.
 *
 * SPDX-License-Identifier: MIT
 */

import type { AstroIntegration } from 'astro'

// Options
// -----------------------------------------------------------------------------
// We don't include 'script-src' and 'style-src' because they are handled by the
// integration itself.
export type CSPDirectiveNames =
	| 'base-uri'
	| 'child-src'
	| 'connect-src'
	| 'default-src'
	| 'font-src'
	| 'form-action'
	| 'frame-ancestors'
	| 'frame-src'
	| 'img-src'
	| 'manifest-src'
	| 'media-src'
	| 'object-src'
	| 'plugin-types'
	| 'prefetch-src'
	| 'require-trusted-types-for'
	| 'sandbox'
	| 'script-src'
	| 'style-src'
	| 'worker-src'

export type CSPDirectives = { [k in CSPDirectiveNames]?: string }

export type CSPOptions = {
	/**
	 * - If set to `all`, the `script-src` and `style-src` directives will include
	 *   all known SRI hashes (independently of whether the associated asset is
	 *   referenced in the page or not). This can be useful to avoid problems with
	 *   the View Transitions feature.
	 * - If set to `perPage`, the `script-src` and `style-src` directives will
	 *   include only the SRI hashes of the assets referenced in the page. This is
	 *   more secure and efficient, but it can cause problems with the View
	 *   Transitions feature.
	 *
	 * Defaults to `all`.
	 */
	// sriHashesStrategy?: 'all' | 'perPage' // TODO: Enable in the future

	/**
	 * - If set, it controls the "default" CSP directives (they can be overriden
	 *   at runtime).
	 * - If not set, the middleware will use a minimal set of default directives.
	 */
	cspDirectives?: CSPDirectives
}

export type SRIOptions = {
	/**
	 * When set to `true`, `@kindspells/astro-shield` will generate Subresource
	 * Integrity (SRI) hashes for all assets referenced in static HTML pages.
	 *
	 * Defaults to `true`.
	 */
	enableStatic?: boolean

	/**
	 * When set to `true`, `@kindspells/astro-shield` will generate Subresource
	 * Integrity (SRI) hashes for all assets referenced in dynamic pages by
	 * enabling a middleware that will inject the SRI hashes into the generated
	 * HTML.
	 *
	 * Defaults to `false`.
	 */
	enableMiddleware?: boolean

	/**
	 * Specifies the path for the auto-generated module that will contain the SRI
	 * hashes. Note that:
	 * - The generated module will be an ESM module
	 * - The generated module should be treated as source code, and not as a build
	 *   artifact.
	 */
	hashesModule?: string | undefined
}

export type SecurityHeadersOptions = {
	/**
	 * - If set, it controls how the CSP (Content Security Policy) header will be
	 *   generated in the middleware.
	 * - If not set, no CSP header will be generated.
	 *
	 * Defaults to `undefined`.
	 */
	contentSecurityPolicy?: CSPOptions | undefined
}

export type ShieldOptions = {
	/**
	 * Options related to Subresource Integrity (SRI).
	 */
	sri?: SRIOptions | undefined

	/**
	 * - If set, it controls how the security headers will be generated in the
	 *   middleware.
	 * - If not set, no security headers will be generated in the middleware.
	 *
	 * Defaults to `undefined`.
	 */
	securityHeaders?: SecurityHeadersOptions | undefined

	/** @deprecated Use `sri.enableStatic` instead. */
	enableStatic_SRI?: boolean | undefined

	/** @deprecated Use `sri.enableMiddleware` instead. */
	enableMiddleware_SRI?: boolean | undefined

	/** @deprecated Use `sri.hashesModule` instead. */
	sriHashesModule?: string | undefined
}
export type StrictShieldOptions = ShieldOptions & {
	distDir: string
	sri: SRIOptions & { enableStatic: boolean; enableMiddleware: boolean }
}

// Main Integration
// -----------------------------------------------------------------------------
export function shield(sriCspOptions: ShieldOptions): AstroIntegration
export default shield
