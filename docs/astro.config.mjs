/*
 * SPDX-FileCopyrightText: 2024 KindSpells Labs S.L.
 *
 * SPDX-License-Identifier: MIT
 */

import starlight from '@astrojs/starlight'
import { shield } from '@kindspells/astro-shield'
import aws from 'astro-sst'
import { defineConfig, passthroughImageService } from 'astro/config'

const locales = {
	root: { lang: 'en', label: 'English' },
	ca: { lang: 'ca', label: 'Català' },
	es: { lang: 'es', label: 'Español' },
}

export default defineConfig({
	output: 'static',
	adapter: aws(),
	site: 'https://astro-shield.kindspells.dev',
	image: {
		service: passthroughImageService(),
	},
	integrations: [
		shield({}),
		starlight({
			title: 'Astro-Shield Docs',
			defaultLocale: 'root',
			locales,
			social: {
				github: 'https://github.com/kindspells/astro-shield',
			},
			sidebar: [
				{
					label: 'Start Here',
					translations: {
						ca: 'Comença Aquí',
						es: 'Empieza Aquí',
					},
					items: [
						{
							label: 'Getting Started',
							translations: {
								ca: 'Començant',
								es: 'Empezando',
							},
							link: '/getting-started/',
						},
					],
				},
				{
					label: 'Guides',
					translations: {
						ca: 'Guies',
						es: 'Guías',
					},
					items: [
						{
							label: 'Subresource Integrity',
							autogenerate: {
								directory: 'guides/subresource-integrity',
							},
						},
						{
							label: 'Security Headers',
							translations: {
								ca: 'Capçaleres de Seguretat',
								es: 'Cabeceras de Seguridad',
							},
							autogenerate: {
								directory: 'guides/security-headers',
							},
						},
						{
							label: 'Hosting Integrations',
							translations: {
								ca: "Proveïdors d'Allotjament",
								es: 'Proveedores de Alojamiento',
							},
							autogenerate: {
								directory: 'guides/hosting-integrations',
							},
						},
					],
				},
				{
					label: 'Reference',
					translations: {
						ca: 'Referència',
						es: 'Referencia',
					},
					items: [
						{
							label: 'Configuration',
							translations: {
								ca: 'Configuració',
								es: 'Configuración',
							},
							link: '/reference/configuration/',
						},
					],
				},
				{
					label: 'Other',
					translations: {
						ca: 'Altres',
						es: 'Otros',
					},
					items: [
						{
							label: 'Known Limitations',
							translations: {
								ca: 'Problemes Coneguts',
								es: 'Problemas Conocidos',
							},
							link: '/other/known-limitations/',
						},
						{
							label: 'Contributing',
							translations: {
								ca: 'Contribució',
								es: 'Contribución',
							},
							link: 'https://github.com/kindspells/astro-shield/blob/main/CONTRIBUTING.md',
						},
						{
							label: 'Team & Services',
							translations: {
								ca: 'Equip i Serveis',
								es: 'Equipo y Servicios',
							},
							link: '/other/team-services/',
						},
					],
				},
			],
		}),
	],
})
