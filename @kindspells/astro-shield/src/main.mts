/*
 * SPDX-FileCopyrightText: 2024 KindSpells Labs S.L.
 *
 * SPDX-License-Identifier: MIT
 */

import type { AstroIntegration } from 'astro'

import { getAstroBuildDone, getAstroConfigSetup } from '#as/core'
import type { IntegrationState, ShieldOptions, SRIOptions } from './types.mts'

const logWarn = (msg: string): void =>
	console.warn(`\nWARNING (@kindspells/astro-shield):\n\t${msg}\n`)

// Integration
// -----------------------------------------------------------------------------
export const shield = ({
	delayTransform,
	securityHeaders,
	sri,
}: ShieldOptions): AstroIntegration => {
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

	const _delayTransform =
		delayTransform ??
		securityHeaders?.enableOnStaticPages?.provider === 'vercel'

	const state: IntegrationState = {
		delayTransform: _delayTransform,
		config: {},
	}

	return {
		name: '@kindspells/astro-shield',
		hooks: {
			'astro:config:setup': getAstroConfigSetup(state, _sri, securityHeaders),
			...(_delayTransform
				? undefined
				: {
						'astro:build:done': getAstroBuildDone(state, _sri, securityHeaders),
					}),
		},
	} satisfies AstroIntegration
}

export default shield
