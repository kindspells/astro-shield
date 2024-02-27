/*
 * SPDX-FileCopyrightText: 2024 KindSpells Labs S.L.
 *
 * SPDX-License-Identifier: MIT
 */

import { createHash } from 'node:crypto'
import { readFile, readdir, stat, writeFile } from 'node:fs/promises'
import { extname, resolve } from 'node:path'

/**
 * @typedef {{
 * 	inlineScriptHashes: Set<string>,
 * 	inlineStyleHashes: Set<string>,
 * 	extScriptHashes: Set<string>,
 * 	extStyleHashes: Set<string>,
 * }} HashesCollection
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

/**
 * This function extracts SRI hashes from inline and external resources, and
 * adds the integrity attribute to the related HTML elements.
 *
 * Notice that it assumes that the HTML content is relatively well-formed, and
 * that in case it already contains integrity attributes then they are correct.
 *
 * @param {import('astro').AstroIntegrationLogger} logger
 * @param {string} distDir
 * @param {string} content
 * @param {HashesCollection} h
 * @returns {Promise<string>}
 */
export const updateSriHashes = async (logger, distDir, content, h) => {
	const processors = /** @type {const} */ ([
		{
			t: 'Script',
			regex:
				/<script(?<attrs>(\s+[a-z][a-z0-9\-_]*(=('[^']*?'|"[^"]*?"))?)*?)\s*>(?<content>[\s\S]*?)<\/\s*script\s*>/gi,
			replacer: scriptReplacer,
			hasContent: true,
			attrsRegex: undefined,
		},
		{
			t: 'Style',
			regex:
				/<style(?<attrs>(\s+[a-z][a-z0-9\-_]*(=('[^']*?'|"[^"]*?"))?)*?)\s*>(?<content>[\s\S]*?)<\/\s*style\s*>/gi,
			replacer: styleReplacer,
			hasContent: true,
			attrsRegex: undefined,
		},
		{
			t: 'Style',
			regex:
				/<link(?<attrs>(\s+[a-z][a-z0-9\-_]*(=('[^']*?'|"[^"]*?"))?)*?)\s*\/?>/gi,
			replacer: linkStyleReplacer,
			hasContent: false,
			attrsRegex: relStylesheetRegex,
		},
	])

	let updatedContent = content
	let match

	for (const { attrsRegex, hasContent, regex, replacer, t } of processors) {
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

				if (integrityMatch) {
					sriHash =
						integrityMatch.groups?.integrity1 ??
						integrityMatch.groups?.integrity2
					if (sriHash) {
						;(srcMatch ? h[`ext${t}Hashes`] : h[`inline${t}Hashes`]).add(
							sriHash,
						)
						continue
					}
				}

				if (srcMatch) {
					const src = srcMatch.groups?.src1 ?? srcMatch.groups?.src2 ?? ''

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
				}
			}

			if (hasContent && !sriHash) {
				sriHash = generateSRIHash(content)
				h[`inline${t}Hashes`].add(sriHash)
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
 * @param {import('astro').AstroIntegrationLogger} logger
 * @param {string} filePath
 * @param {string} distDir
 * @param {HashesCollection} h
 */
const processHTMLFile = async (logger, filePath, distDir, h) => {
	const content = await readFile(filePath, 'utf8')
	const updatedContent = await updateSriHashes(logger, distDir, content, h)

	if (updatedContent !== content) {
		await writeFile(filePath, updatedContent)
	}
}

/**
 * @param {import('astro').AstroIntegrationLogger} logger
 * @param {string} dirPath
 * @param {string} distDir
 * @param {HashesCollection} h
 */
const scanDirectory = async (logger, dirPath, distDir, h) => {
	for (const file of await readdir(dirPath)) {
		const filePath = resolve(dirPath, file)
		const stats = await stat(filePath)

		if (stats.isDirectory()) {
			await scanDirectory(logger, filePath, distDir, h)
		} else if (stats.isFile() && extname(file) === '.html') {
			await processHTMLFile(logger, filePath, distDir, h)
		}
	}
}

/**
 * @param {string} path
 * @returns {Promise<boolean>}
 */
export const doesFileExist = async path => {
	try {
		await stat(path)
		return true
	} catch (err) {
		if (/** @type {{ code: unknown }} */ (err).code === 'ENOENT') {
			return false
		}
		throw err
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
 * This is a hack to scan for nested scripts in the `_astro` directory, but they
 * should be detected in a recursive way, when we process the JS files that are
 * being directly imported in the HTML files.
 *
 * TODO: Remove this function and implement the recursive scan.
 *
 * @param {string} dirPath
 * @param {Set<string>} extScriptHashes
 */
const scanForNestedScripts = async (dirPath, extScriptHashes) => {
	const nestedScriptsDir = resolve(dirPath, '_astro')

	if (!(await doesFileExist(nestedScriptsDir))) {
		return
	}

	for (const file of await readdir(nestedScriptsDir)) {
		const filePath = resolve(nestedScriptsDir, file)

		if (
			(await stat(filePath)).isFile() &&
			['.js', '.mjs'].includes(extname(file))
		) {
			const sriHash = generateSRIHash(await readFile(filePath))
			extScriptHashes.add(sriHash)
		}
	}
}

/**
 * @param {import('astro').AstroIntegrationLogger} logger
 * @param {import('./main.d.ts').StrictShieldOptions} shieldOptions
 */
export const generateSRIHashes = async (
	logger,
	{ distDir, sriHashesModule },
) => {
	const h = {
		inlineScriptHashes: new Set(),
		inlineStyleHashes: new Set(),
		extScriptHashes: new Set(),
		extStyleHashes: new Set(),
	}
	await scanDirectory(logger, distDir, distDir, h)

	// TODO: Remove temporary hack
	await scanForNestedScripts(distDir, h.extScriptHashes)

	if (!sriHashesModule) {
		return
	}

	let persistHashes = false

	const inlineScriptHashes = Array.from(h.inlineScriptHashes).sort()
	const inlineStyleHashes = Array.from(h.inlineStyleHashes).sort()
	const extScriptHashes = Array.from(h.extScriptHashes).sort()
	const extStyleHashes = Array.from(h.extStyleHashes).sort()

	if (await doesFileExist(sriHashesModule)) {
		const hModule = /** @type {{
			inlineScriptHashes?: string[] | undefined
			inlineStyleHashes?: string[] | undefined
			extScriptHashes?: string[] | undefined
			extStyleHashes?: string[] | undefined
		}} */ (await import(sriHashesModule))

		persistHashes =
			!arraysEqual(inlineScriptHashes, hModule.inlineScriptHashes ?? []) ||
			!arraysEqual(inlineStyleHashes, hModule.inlineStyleHashes ?? []) ||
			!arraysEqual(extScriptHashes, hModule.extScriptHashes ?? []) ||
			!arraysEqual(extStyleHashes, hModule.extStyleHashes ?? [])
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
			.join('')}${extStyleHashes.length > 0 ? '\n' : ''}])\n`

		await writeFile(sriHashesModule, hashesFileContent)
	}
}
