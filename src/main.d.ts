/*
 * SPDX-FileCopyrightText: 2024 KindSpells Labs S.L.
 *
 * SPDX-License-Identifier: MIT
 */

import type { AstroIntegration } from 'astro'

// Options
// -----------------------------------------------------------------------------
export type ShieldOptions = {
	/**
	 * When set to `true`, `@kindspells/astro-shield` will generate Subresource
	 * Integrity (SRI) hashes for all assets referenced in static HTML pages.
	 *
	 * Defaults to `true`.
	 */
	enableStatic_SRI?: boolean | undefined

	/**
	 * When set to `true`, `@kindspells/astro-shield` will generate Subresource
	 * Integrity (SRI) hashes for all assets referenced in dynamic pages by
	 * enabling a middleware that will inject the SRI hashes into the generated
	 * HTML.
	 *
	 * Defaults to `false`.
	 */
	enableMiddleware_SRI?: boolean | undefined

	/**
	 * Specifies the path for the auto-generated module that will contain the SRI
	 * hashes. Note that:
	 * - The generated module will be an ESM module
	 * - The generated module should be treated as source code, and not as a build
	 *   artifact.
	 */
	sriHashesModule?: string | undefined
}
export type StrictShieldOptions = ShieldOptions & {
	distDir: string
	enableMiddleware_SRI: boolean
}

// Main Integration
// -----------------------------------------------------------------------------
export function shield(sriCspOptions: ShieldOptions): AstroIntegration
export default shield
