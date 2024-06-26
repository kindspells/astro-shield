/*
 * SPDX-FileCopyrightText: 2024 KindSpells Labs S.L.
 *
 * SPDX-License-Identifier: MIT
 */

import starlight from '@astrojs/starlight'
import { shield } from '@kindspells/astro-shield'
import aws from 'astro-sst'
import { defineConfig, passthroughImageService } from 'astro/config'

export default defineConfig({
	output: 'static',
	adapter: aws(),
	site: 'https://astro-shield.kindspells.dev',
	image: {
		service: passthroughImageService(),
	},
	i18n: {
		locales: ['en'],
		defaultLocale: 'en',
	},
	integrations: [
		shield({}),
		starlight({
			title: 'Astro-Shield Docs',
			defaultLocale: 'en',
			locales: {
				root: {
					label: 'English',
					lang: 'en',
				},
				en: {
					label: 'English',
					lang: 'en',
				},
			},
			social: {
				github: 'https://github.com/kindspells/astro-shield',
			},
			sidebar: [
				{
					label: 'Start Here',
					items: [{ label: 'Getting Started', link: '/getting-started/' }],
				},
				{
					label: 'Guides',
					items: [
						{
							label: 'Subresource Integrity',
							autogenerate: {
								directory: 'guides/subresource-integrity',
							},
						},
						{
							label: 'Security Headers',
							autogenerate: {
								directory: 'guides/security-headers',
							},
						},
					],
				},
				{
					label: 'Other',
					items: [
						{
							label: 'Known Limitations',
							link: '/other/known-limitations/',
						},
						{
							label: 'Contributing',
							link: 'https://github.com/kindspells/astro-shield/blob/main/CONTRIBUTING.md',
						},
					],
				},
				// {
				// 	label: 'Reference',
				// 	autogenerate: { directory: 'reference' },
				// },
			],
		}),
	],
})
