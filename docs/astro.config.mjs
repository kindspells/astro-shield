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
	hi: { lang: 'hi', label: 'हिन्दी' },
}

export default defineConfig({
	site: 'https://astro-shield.kindspells.dev',
	output: 'static',
	adapter: aws(),
	trailingSlash: 'always',
	image: { service: passthroughImageService() },
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
						hi: 'यहाँ से शुरू करें',
					},
					items: [
						{
							label: 'Getting Started',
							translations: {
								ca: 'Començant',
								es: 'Empezando',
								hi: 'शुरुआत करना',
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
						hi: 'मार्गदर्शिकाएँ',
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
								hi: 'सुरक्षा हेडर',
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
								hi: 'होस्टिंग एकीकरण',
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
						hi: 'संदर्भ',
					},
					items: [
						{
							label: 'Configuration',
							translations: {
								ca: 'Configuració',
								es: 'Configuración',
								hi: 'कॉन्फ़िगरेशन',
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
						hi: 'अन्य',
					},
					items: [
						{
							label: 'Known Limitations',
							translations: {
								ca: 'Problemes Coneguts',
								es: 'Problemas Conocidos',
								hi: 'ज्ञात सीमाएँ',
							},
							link: '/other/known-limitations/',
						},
						{
							label: 'Contributing',
							translations: {
								ca: 'Contribució',
								es: 'Contribución',
								hi: 'योगदान',
							},
							link: 'https://github.com/kindspells/astro-shield/blob/main/CONTRIBUTING.md',
						},
						{
							label: 'Team & Services',
							translations: {
								ca: 'Equip i Serveis',
								es: 'Equipo y Servicios',
								hi: 'टीम और सेवाएँ',
							},
							link: '/other/team-services/',
						},
					],
				},
			],
			lastUpdated: true,
			editLink: {
				baseUrl: 'https://github.com/kindspells/astro-shield/edit/main/docs/',
			},
		}),
	],
})
