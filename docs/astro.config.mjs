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
	ru: { lang: 'ru', label: 'Русский' },
}

export default defineConfig({
	site: 'https://astro-shield.kindspells.dev',
	output: 'static',
	adapter: aws(),
	trailingSlash: 'always',
	image: { service: passthroughImageService() },
	integrations: [
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
						ru: 'Введение',
					},
					items: [
						{
							label: 'Getting Started',
							translations: {
								ca: 'Començant',
								es: 'Empezando',
								hi: 'शुरुआत करना',
								ru: 'Начало работы',
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
						ru: 'Руководства',
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
								ru: 'Заголовки безопасности',
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
								ru: 'Интеграции хостинга',
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
						ru: 'Справка',
					},
					items: [
						{
							label: 'Configuration',
							translations: {
								ca: 'Configuració',
								es: 'Configuración',
								hi: 'कॉन्फ़िगरेशन',
								ru: 'Конфигурация',
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
						ru: 'Другое',
					},
					items: [
						{
							label: 'Known Limitations',
							translations: {
								ca: 'Problemes Coneguts',
								es: 'Problemas Conocidos',
								hi: 'ज्ञात सीमाएँ',
								ru: 'Известные ограничения',
							},
							link: '/other/known-limitations/',
						},
						{
							label: 'Contributing',
							translations: {
								ca: 'Contribució',
								es: 'Contribución',
								hi: 'योगदान',
								ru: 'Внести свой вклад',
							},
							link: 'https://github.com/kindspells/astro-shield/blob/main/CONTRIBUTING.md',
						},
						{
							label: 'Team & Services',
							translations: {
								ca: 'Equip i Serveis',
								es: 'Equipo y Servicios',
								hi: 'टीम और सेवाएँ',
								ru: 'Команда и сервисы',
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
		shield({ sri: { enableStatic: true } }),
	],
	build: {
		format: 'directory',
		inlineStylesheets: 'never',
	},
})
