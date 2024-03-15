/*
 * SPDX-FileCopyrightText: 2024 KindSpells Labs S.L.
 *
 * SPDX-License-Identifier: MIT
 */

import { createHash } from 'node:crypto'
import { readFile, writeFile } from 'node:fs/promises'
import { extname, resolve, relative } from 'node:path'
import { doesFileExist, scanDirectory } from './fs.mjs'

/**
 * @typedef {import('./core.d.ts').PerPageHashes} PerPageHashes
 * @typedef {import('./core.d.ts').PerPageHashesCollection} PerPageHashesCollection
 * @typedef {import('./core.d.ts').HashesCollection} HashesCollection
 * @typedef {import('./core.d.ts').MiddlewareHashes} MiddlewareHashes
 * @typedef {import('./core.d.ts').Logger} Logger
 * @typedef {import('astro').AstroIntegration} Integration
 */

/**
 * @param {string | ArrayBuffer | Buffer} data
 * @returns {string}
 */
export const generateSRIHash = data => {
	const hash = createHash('sha256')
	if (data instanceof ArrayBuffer) {
		hash.update(Buffer.from(data))
	} else if (data instanceof Buffer) {
		hash.update(data)
	} else {
		hash.update(data, 'utf8')
	}
	return `sha256-${hash.digest('base64')}`
}

/**
 * @typedef {(
 *   hash: string,
 *   attrs: string,
 *   setCrossorigin: boolean,
 *   content?: string | undefined,
 * ) => string} ElemReplacer
 */

/** @type {ElemReplacer} */
const scriptReplacer = (hash, attrs, setCrossorigin, content) =>
	`<script${attrs} integrity="${hash}"${
		setCrossorigin ? ' crossorigin="anonymous"' : ''
	}>${content ?? ''}</script>`

/** @type {ElemReplacer} */
const styleReplacer = (hash, attrs, setCrossorigin, content) =>
	`<style${attrs} integrity="${hash}"${
		setCrossorigin ? ' crossorigin="anonymous"' : ''
	}>${content ?? ''}</style>`

/** @type {ElemReplacer} */
const linkStyleReplacer = (hash, attrs, setCrossorigin) =>
	`<link${attrs} integrity="${hash}"${
		setCrossorigin ? ' crossorigin="anonymous"' : ''
	}/>`

const srcRegex = /\s+(src|href)\s*=\s*("(?<src1>.*?)"|'(?<src2>.*?)')/i
const integrityRegex =
	/\s+integrity\s*=\s*("(?<integrity1>.*?)"|'(?<integrity2>.*?)')/i
const relStylesheetRegex = /\s+rel\s*=\s*('stylesheet'|"stylesheet")/i

const getRegexProcessors = () => {
	return /** @type {const} */ ([
		{
			t: 'Script',
			t2: 'scripts',
			regex:
				/<script(?<attrs>(\s+[a-z][a-z0-9\-_]*(=('[^']*?'|"[^"]*?"))?)*?)\s*>(?<content>[\s\S]*?)<\/\s*script\s*>/gi,
			replacer: scriptReplacer,
			hasContent: true,
			attrsRegex: undefined,
		},
		{
			t: 'Style',
			t2: 'styles',
			regex:
				/<style(?<attrs>(\s+[a-z][a-z0-9\-_]*(=('[^']*?'|"[^"]*?"))?)*?)\s*>(?<content>[\s\S]*?)<\/\s*style\s*>/gi,
			replacer: styleReplacer,
			hasContent: true,
			attrsRegex: undefined,
		},
		{
			t: 'Style',
			t2: 'styles',
			regex:
				/<link(?<attrs>(\s+[a-z][a-z0-9\-_]*(=('[^']*?'|"[^"]*?"))?)*?)\s*\/?>/gi,
			replacer: linkStyleReplacer,
			hasContent: false,
			attrsRegex: relStylesheetRegex,
		},
	])
}

/**
 * This function extracts SRI hashes from inline and external resources, and
 * adds the integrity attribute to the related HTML elements.
 *
 * Notice that it assumes that the HTML content is relatively well-formed, and
 * that in case it already contains integrity attributes then they are correct.
 *
 * @param {Logger} logger
 * @param {string} distDir
 * @param {string} relativeFilepath
 * @param {string} content
 * @param {HashesCollection} h
 * @returns {Promise<string>}
 */
export const updateStaticPageSriHashes = async (
	logger,
	distDir,
	relativeFilepath,
	content,
	h,
) => {
	const processors = getRegexProcessors()

	const pageHashes =
		h.perPageSriHashes.get(relativeFilepath) ??
		/** @type {PerPageHashes} */ ({
			scripts: new Set(),
			styles: new Set(),
		})
	h.perPageSriHashes.set(relativeFilepath, pageHashes)

	let updatedContent = content
	let match

	for (const { attrsRegex, hasContent, regex, replacer, t, t2 } of processors) {
		// biome-ignore lint/suspicious/noAssignInExpressions: safe
		while ((match = regex.exec(content)) !== null) {
			const attrs = match.groups?.attrs ?? ''
			const content = match.groups?.content ?? ''

			/** @type {string | undefined} */
			let sriHash = undefined
			let setCrossorigin = false

			if (attrs) {
				if (attrsRegex && !attrsRegex.test(attrs)) {
					continue
				}

				const srcMatch = srcRegex.exec(attrs)
				const integrityMatch = integrityRegex.exec(attrs)
				const src = srcMatch?.groups?.src1 ?? srcMatch?.groups?.src2 ?? ''

				if (integrityMatch) {
					sriHash =
						integrityMatch.groups?.integrity1 ??
						integrityMatch.groups?.integrity2
					if (sriHash) {
						;(srcMatch ? h[`ext${t}Hashes`] : h[`inline${t}Hashes`]).add(
							sriHash,
						)
						pageHashes[t2].add(sriHash)
						if (src) {
							h.perResourceSriHashes[t2].set(src, sriHash)
						}
						continue
					}
				}

				if (src) {
					const cachedHash = h.perResourceSriHashes[t2].get(src)
					if (cachedHash) {
						sriHash = cachedHash
						h[`ext${t}Hashes`].add(sriHash)
						pageHashes[t2].add(sriHash)
					} else {
						/** @type {string | ArrayBuffer | Buffer} */
						let resourceContent
						if (src.startsWith('/')) {
							const resourcePath = resolve(distDir, `.${src}`)
							resourceContent = await readFile(resourcePath)
						} else if (src.startsWith('http')) {
							setCrossorigin = true
							const resourceResponse = await fetch(src, { method: 'GET' })
							resourceContent = await resourceResponse.arrayBuffer()
						} else {
							logger.warn(`Unable to process external resource: "${src}"`)
							continue
						}

						sriHash = generateSRIHash(resourceContent)
						h[`ext${t}Hashes`].add(sriHash)
						pageHashes[t2].add(sriHash)
						h.perResourceSriHashes[t2].set(src, sriHash)
					}
				}
			}

			if (hasContent && !sriHash) {
				sriHash = generateSRIHash(content)
				h[`inline${t}Hashes`].add(sriHash)
				pageHashes[t2].add(sriHash)
			}

			if (sriHash) {
				updatedContent = updatedContent.replace(
					match[0],
					replacer(sriHash, attrs, setCrossorigin, content),
				)
			}
		}
	}

	return updatedContent
}

/**
 * @param {Logger} logger
 * @param {string} content
 * @param {MiddlewareHashes} globalHashes
 */
export const updateDynamicPageSriHashes = async (
	logger,
	content,
	globalHashes,
) => {
	const processors = getRegexProcessors()

	let updatedContent = content
	let match

	const pageHashes = /** @type {PerPageHashes} */ ({
		scripts: new Set(),
		styles: new Set(),
	})

	for (const { attrsRegex, hasContent, regex, replacer, t2 } of processors) {
		// biome-ignore lint/suspicious/noAssignInExpressions: safe
		while ((match = regex.exec(content)) !== null) {
			const attrs = match.groups?.attrs ?? ''
			const content = match.groups?.content ?? ''

			/** @type {string | undefined} */
			let sriHash = undefined
			let setCrossorigin = false

			if (attrs) {
				if (attrsRegex && !attrsRegex.test(attrs)) {
					continue
				}

				const srcMatch = srcRegex.exec(attrs)
				const integrityMatch = integrityRegex.exec(attrs)
				const src = srcMatch?.groups?.src1 ?? srcMatch?.groups?.src2

				if (content && src) {
					logger.warn(
						`scripts must have either a src attribute or content, but not both "${src}"`,
					)
					continue
				}

				if (integrityMatch) {
					sriHash =
						integrityMatch.groups?.integrity1 ??
						integrityMatch.groups?.integrity2
					if (sriHash) {
						if (src) {
							const globalHash = globalHashes[t2].get(src)
							if (globalHash) {
								if (globalHash !== sriHash) {
									throw new Error(
										`SRI hash mismatch for "${src}", expected "${globalHash}" but got "${sriHash}"`,
									)
								}
							} else {
								globalHashes[t2].set(src, sriHash)
							}
						}
						pageHashes[t2].add(sriHash)
					} else {
						logger.warn('Found empty integrity attribute, skipping...')
					}
					continue
				}

				if (src) {
					/** @type {string | ArrayBuffer | Buffer} */
					if (src.startsWith('/')) {
						sriHash = globalHashes[t2].get(src)
						if (sriHash) {
							pageHashes[t2].add(sriHash)
						} else {
							if (
								!(
									src.startsWith('/@vite/') ||
									src.startsWith('/@fs/') ||
									src.indexOf('?astro&type=') >= 0
								)
							) {
								logger.warn(
									`Unable to obtain SRI hash for local resource: "${src}"`,
								)
							}
							continue
						}
					} else if (src.startsWith('http')) {
						setCrossorigin = true
						sriHash = globalHashes[t2].get(src)

						if (sriHash) {
							pageHashes[t2].add(sriHash)
						} else {
							const resourceResponse = await fetch(src, { method: 'GET' })
							const resourceContent = await resourceResponse.arrayBuffer()

							sriHash = generateSRIHash(resourceContent)
							globalHashes[t2].set(src, sriHash)
							pageHashes[t2].add(sriHash)
						}
					} else {
						logger.warn(`Unable to process external resource: "${src}"`)
						continue
					}
				}
			}

			if (hasContent && !sriHash) {
				sriHash = generateSRIHash(content)
				pageHashes[t2].add(sriHash)
			}

			if (sriHash) {
				updatedContent = updatedContent.replace(
					match[0],
					replacer(sriHash, attrs, setCrossorigin, content),
				)
			}
		}
	}

	return {
		pageHashes,
		updatedContent,
	}
}

/**
 * @param {Logger} logger
 * @param {string} filePath
 * @param {string} distDir
 * @param {HashesCollection} h
 */
const processHTMLFile = async (logger, filePath, distDir, h) => {
	const content = await readFile(filePath, 'utf8')
	const updatedContent = await updateStaticPageSriHashes(
		logger,
		distDir,
		relative(distDir, filePath),
		content,
		h,
	)

	if (updatedContent !== content) {
		await writeFile(filePath, updatedContent)
	}
}

/**
 * @param {unknown[]} a
 * @param {unknown[]} b
 * @returns {boolean}
 */
export const arraysEqual = (a, b) => {
	if (a.length !== b.length) {
		return false
	}

	for (let i = 0; i < a.length; i++) {
		if (a[i] !== b[i]) {
			return false
		}
	}

	return true
}

/**
 * @param {Record<string, { scripts: string[], styles: string[] }>} a
 * @param {Record<string, { scripts: string[], styles: string[] }>} b
 * @returns {boolean}
 */
export const pageHashesEqual = (a, b) => {
	const aKeys = Object.keys(a).sort()
	const bKeys = Object.keys(b).sort()

	if (!arraysEqual(aKeys, bKeys)) {
		return false
	}

	for (const [aKey, aValue] of Object.entries(a)) {
		const bValue = b[aKey]
		if (!bValue) {
			return false
		}

		if (
			!arraysEqual(aValue.scripts, bValue.scripts) ||
			!arraysEqual(aValue.styles, bValue.styles)
		) {
			return false
		}
	}

	return true
}

/**
 * @param {{ scripts: Record<string, string>; styles: Record<string, string> }} a
 * @param {{ scripts: Record<string, string>; styles: Record<string, string> }} b
 * @returns {boolean}
 */
export const sriHashesEqual = (a, b) => {
	const aScriptsKeys = Object.keys(a.scripts).sort()
	const bScriptsKeys = Object.keys(b.scripts).sort()
	const aStylesKeys = Object.keys(a.styles).sort()
	const bStylesKeys = Object.keys(b.styles).sort()

	if (
		!arraysEqual(aScriptsKeys, bScriptsKeys) ||
		!arraysEqual(aStylesKeys, bStylesKeys)
	) {
		return false
	}

	for (const [aKey, aValue] of Object.entries(a.scripts)) {
		if (b.scripts[aKey] !== aValue) {
			return false
		}
	}
	for (const [aKey, aValue] of Object.entries(a.styles)) {
		if (b.styles[aKey] !== aValue) {
			return false
		}
	}

	return true
}

/**
 * This is a hack to scan for nested scripts in the `_astro` directory, but they
 * should be detected in a recursive way, when we process the JS files that are
 * being directly imported in the HTML files.
 *
 * @param {Logger} logger
 * @param {string} dirPath
 * @param {HashesCollection} h
 */
export const scanForNestedResources = async (logger, dirPath, h) => {
	await scanDirectory(
		logger,
		dirPath,
		dirPath,
		h,
		async (_logger, _filePath, _distDir, _h) => {
			const relativePath = `/${relative(_distDir, _filePath)}`

			const ext = extname(_filePath)
			if (['.js', '.mjs'].includes(ext)) {
				if (!_h.perResourceSriHashes.scripts.has(relativePath)) {
					const sriHash = generateSRIHash(await readFile(_filePath))
					_h.extScriptHashes.add(sriHash)
					_h.perResourceSriHashes.scripts.set(relativePath, sriHash)
				}
			} else if (ext === '.css') {
				if (!_h.perResourceSriHashes.styles.has(relativePath)) {
					const sriHash = generateSRIHash(await readFile(_filePath))
					_h.extStyleHashes.add(sriHash)
					_h.perResourceSriHashes.styles.set(relativePath, sriHash)
				}
			}
		},
		_filePath => ['.js', '.mjs', '.css'].includes(extname(_filePath)),
	)
}

/**
 * @param {HashesCollection} h
 * @param {string} sriHashesModule
 */
export async function generateSRIHashesModule(h, sriHashesModule) {
	let persistHashes = false

	const inlineScriptHashes = Array.from(h.inlineScriptHashes).sort()
	const inlineStyleHashes = Array.from(h.inlineStyleHashes).sort()
	const extScriptHashes = Array.from(h.extScriptHashes).sort()
	const extStyleHashes = Array.from(h.extStyleHashes).sort()
	const perPageHashes =
		/** @type {Record<string, { scripts: string[]; styles: string [] }>} */ ({})
	for (const [k, v] of h.perPageSriHashes.entries()) {
		perPageHashes[k] = {
			scripts: Array.from(v.scripts).sort(),
			styles: Array.from(v.styles).sort(),
		}
	}
	const perResourceHashes = {
		scripts: /** @type {Record<string, string>} */ ({}),
		styles: /** @type {Record<string, string>} */ ({}),
	}
	for (const [k, v] of h.perResourceSriHashes.scripts.entries()) {
		perResourceHashes.scripts[k] = v
	}
	for (const [k, v] of h.perResourceSriHashes.styles.entries()) {
		perResourceHashes.styles[k] = v
	}

	if (await doesFileExist(sriHashesModule)) {
		const hModule = /**
			@type {{
					[k in keyof HashesCollection]: HashesCollection[k] extends Set<string>
							? string[] | undefined
							: (k extends 'perPageSriHashes'
								? Record<string, { scripts: string[]; styles: string [] }>
								: Record<'scripts' | 'styles', Record<string, string>>)
		}} */ (await import(/* @vite-ignore */ sriHashesModule))

		persistHashes =
			!arraysEqual(inlineScriptHashes, hModule.inlineScriptHashes ?? []) ||
			!arraysEqual(inlineStyleHashes, hModule.inlineStyleHashes ?? []) ||
			!arraysEqual(extScriptHashes, hModule.extScriptHashes ?? []) ||
			!arraysEqual(extStyleHashes, hModule.extStyleHashes ?? []) ||
			!pageHashesEqual(perPageHashes, hModule.perPageSriHashes ?? {}) ||
			!sriHashesEqual(
				perResourceHashes,
				hModule.perResourceSriHashes ?? { scripts: {}, styles: {} },
			)
	} else {
		persistHashes = true
	}

	if (persistHashes) {
		let hashesFileContent = '// Do not edit this file manually\n\n'
		hashesFileContent += `export const inlineScriptHashes = /** @type {string[]} */ ([${inlineScriptHashes
			.map(h => `\n\t'${h}',`)
			.join('')}${inlineScriptHashes.length > 0 ? '\n' : ''}])\n\n`
		hashesFileContent += `export const inlineStyleHashes = /** @type {string[]} */ ([${inlineStyleHashes
			.map(h => `\n\t'${h}',`)
			.join('')}${inlineStyleHashes.length > 0 ? '\n' : ''}])\n\n`
		hashesFileContent += `export const extScriptHashes = /** @type {string[]} */ ([${extScriptHashes
			.map(h => `\n\t'${h}',`)
			.join('')}${extScriptHashes.length > 0 ? '\n' : ''}])\n\n`
		hashesFileContent += `export const extStyleHashes = /** @type {string[]} */ ([${extStyleHashes
			.map(h => `\n\t'${h}',`)
			.join('')}${extStyleHashes.length > 0 ? '\n' : ''}])\n\n`
		hashesFileContent += `export const perPageSriHashes =\n\t/** @type {Record<string, { scripts: string[]; styles: string [] }>} */ ({${Object.entries(
			perPageHashes,
		)
			.sort()
			.map(
				([k, v]) =>
					`\n\t\t'${k}': {\n\t\t\tscripts: [${v.scripts
						.map(h => `\n\t\t\t\t'${h}',`)
						.join('')}${
						v.scripts.length > 0 ? '\n\t\t\t' : ''
					}],\n\t\t\tstyles: [${v.styles
						.map(h => `\n\t\t\t\t'${h}',`)
						.join('')}${v.styles.length > 0 ? '\n\t\t\t' : ''}],\n\t\t}`,
			)
			.join(',')}}\n)\n\n`
		hashesFileContent += `export const perResourceSriHashes = {\n\tscripts: /** @type {Record<string,string>} */ ({\n${Object.entries(
			perResourceHashes.scripts,
		)
			.map(([k, v]) => `\t\t'${k}': '${v}',\n`)
			.join(
				'',
			)}\t}),\n\tstyles: /** @type {Record<string,string>} */ ({\n${Object.entries(
			perResourceHashes.styles,
		)
			.map(([k, v]) => `\t\t'${k}': '${v}',\n`)
			.join('')}\t}),\n}\n`

		await writeFile(sriHashesModule, hashesFileContent)
	}
}

/**
 * @param {Logger} logger
 * @param {import('./main.d.ts').StrictShieldOptions} shieldOptions
 */
export const processStaticFiles = async (
	logger,
	{ distDir, sriHashesModule },
) => {
	const h = /** @satisfies {HashesCollection} */ {
		inlineScriptHashes: new Set(),
		inlineStyleHashes: new Set(),
		extScriptHashes: new Set(),
		extStyleHashes: new Set(),
		perPageSriHashes: new Map(),
		perResourceSriHashes: {
			scripts: new Map(),
			styles: new Map(),
		},
	}
	await scanDirectory(
		logger,
		distDir,
		distDir,
		h,
		processHTMLFile,
		file => extname(file) === '.html',
	)

	// TODO: Remove temporary hack
	await scanForNestedResources(logger, distDir, h)

	if (!sriHashesModule) {
		return
	}

	await generateSRIHashesModule(h, sriHashesModule)
}

/**
 * @param {MiddlewareHashes} globalHashes
 * @returns {import('astro').MiddlewareHandler}
 */
export const getMiddlewareHandler = globalHashes => {
	/** @satisfies {import('astro').MiddlewareHandler} */
	return async (_ctx, next) => {
		const response = await next()
		const content = await response.text()

		// TODO: Use a "good & async" function, as updateDynamicPageSriHashes cannot
		//       perform certain async actions, like fetching external resources.
		const { updatedContent } = await updateDynamicPageSriHashes(
			console,
			content,
			globalHashes,
		)

		const patchedResponse = new Response(updatedContent, {
			status: response.status,
			statusText: response.statusText,
			headers: response.headers,
		})
		return patchedResponse
	}
}

const middlewareVirtualModuleId = 'virtual:@kindspells/astro-shield/middleware'
const resolvedMiddlewareVirtualModuleId = `\0${middlewareVirtualModuleId}`

const hashesVirtualModuleId = 'virtual:@kindspells/astro-shield/hashes'
const resolvedHashesVirtualModuleId = `\0${hashesVirtualModuleId}`

/**
 * @param {Logger} logger
 * @param {boolean} enableStatic_SRI
 * @param {string | undefined} sriHashesModule
 * @returns {Promise<string>}
 */
const loadVirtualMiddlewareModule = async (
	logger,
	enableStatic_SRI,
	sriHashesModule,
) => {
	let extraImports = ''
	let staticHashesModuleLoader = ''

	if (
		enableStatic_SRI &&
		sriHashesModule &&
		(await doesFileExist(sriHashesModule))
	) {
		extraImports = `import * as hashesModule from '${sriHashesModule}'`
		staticHashesModuleLoader = `
try {
	if (hashesModule.perResourceSriHashes) {
		for (const [key, value] of Object.entries(
			hashesModule.perResourceSriHashes?.scripts ?? {},
		)) {
			globalHashes.scripts.set(key, value)
		}
		for (const [key, value] of Object.entries(
			hashesModule.perResourceSriHashes?.styles ?? {},
		)) {
			globalHashes.styles.set(key, value)
		}
	}
} catch (err) {
	console.warn('Failed to load static hashes module:', err)
}
`
	} else if (enableStatic_SRI && sriHashesModule) {
		logger.warn(
			`The SRI hashes module "${sriHashesModule}" did not exist at build time, run the build step again`,
		)
	}

	return `
import { defineMiddleware } from 'astro/middleware'
import { getGlobalHashes } from '@kindspells/astro-shield/state'
import { getMiddlewareHandler } from '@kindspells/astro-shield/core'
${extraImports}

export const onRequest = await (async () => {
	const globalHashes = await getGlobalHashes()

	${staticHashesModuleLoader}

	return defineMiddleware(getMiddlewareHandler(globalHashes))
})()
`
}

/**
 * @param {boolean} enableStatic_SRI
 * @param {string | undefined} sriHashesModule
 * @returns {Promise<string>}
 */
const loadVirtualHashesModule = async (enableStatic_SRI, sriHashesModule) => {
	if (
		enableStatic_SRI &&
		sriHashesModule &&
		(await doesFileExist(sriHashesModule))
	) {
		return `export * from '${sriHashesModule}'`
	}
	return `
export const inlineScriptHashes = []
export const inlineStyleHashes = []
export const extScriptHashes = []
export const extStyleHashes = []
export const perPageSriHashes = {}
export const perResourceSriHashes = { scripts: {}, styles: {} }
`
}

/**
 * @param {Logger} logger
 * @param {boolean} enableStatic_SRI
 * @param {string | undefined} sriHashesModule
 * @return {import('vite').Plugin}
 */
const getViteMiddlewarePlugin = (logger, enableStatic_SRI, sriHashesModule) => {
	return {
		name: 'vite-plugin-astro-shield',
		resolveId(id) {
			if (id === middlewareVirtualModuleId) {
				return resolvedMiddlewareVirtualModuleId
			}
			return
		},
		async load(id, _options) {
			switch (id) {
				case resolvedMiddlewareVirtualModuleId:
					return await loadVirtualMiddlewareModule(
						logger,
						enableStatic_SRI,
						sriHashesModule,
					)
				case resolvedHashesVirtualModuleId:
					return await loadVirtualHashesModule(
						enableStatic_SRI,
						sriHashesModule,
					)
				default:
					return
			}
		},
	}
}

/**
 *
 * @param {boolean} enableStatic_SRI
 * @param {string | undefined} sriHashesModule
 * @returns
 */
export const getAstroConfigSetup = (enableStatic_SRI, sriHashesModule) => {
	/** @type {Required<Integration['hooks']>['astro:config:setup']} */
	return async ({ logger, addMiddleware, updateConfig }) => {
		const plugin = getViteMiddlewarePlugin(
			logger,
			enableStatic_SRI,
			sriHashesModule,
		)
		updateConfig({ vite: { plugins: [plugin] } })

		addMiddleware({
			order: 'post',
			entrypoint: 'virtual:@kindspells/astro-shield/middleware',
		})
	}
}
