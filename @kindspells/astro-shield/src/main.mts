/*
 * SPDX-FileCopyrightText: 2024 KindSpells Labs S.L.
 *
 * SPDX-License-Identifier: MIT
 */

import type { AstroIntegration } from 'astro'

import { getAstroConfigSetup } from '#as/core'
import type { IntegrationState, ShieldOptions, SRIOptions } from './types.mts'

const logWarn = (msg: string): void =>
	console.warn(`\nWARNING (@kindspells/astro-shield):\n\t${msg}\n`)

// Integration
// -----------------------------------------------------------------------------
export const shield = ({
	securityHeaders,
	sri,
}: ShieldOptions): AstroIntegration => {
	// We need to merge the deprecated options into the new object
	const _sri = {
		enableMiddleware: sri?.enableMiddleware ?? false,
		enableStatic: sri?.enableStatic ?? true,
		hashesModule: sri?.hashesModule,

		allowInlineScripts: sri?.allowInlineScripts ?? 'all',
		allowInlineStyles: sri?.allowInlineStyles ?? 'all',

		scriptsAllowListUrls: sri?.scriptsAllowListUrls ?? [],
		stylesAllowListUrls: sri?.stylesAllowListUrls ?? [],
	} satisfies Required<SRIOptions>

	if (_sri.hashesModule && _sri.enableStatic === false) {
		logWarn('`sri.hashesModule` is ignored when `sri.enableStatic` is `false`')
	}

	const state: IntegrationState = { config: {} }

	return {
		name: '@kindspells/astro-shield',
		hooks: {
			'astro:config:setup': getAstroConfigSetup(state, _sri, securityHeaders),
		},
	} satisfies AstroIntegration
}

export default shield
