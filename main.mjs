/*
 * SPDX-FileCopyrightText: 2024 KindSpells Labs S.L.
 *
 * SPDX-License-Identifier: MIT
 */

import { createHash } from 'node:crypto'
import { readFile, readdir, stat, writeFile } from 'node:fs/promises'
import { extname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * @param {string | ArrayBuffer | Buffer} data
 * @returns {string}
 */
const generateSRIHash = data => {
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
 * @param {RegExp} elemRegex
 * @param {string} content
 * @param {Set<string>} inlineHashes
 */
const extractKnownSriHashes = (elemRegex, content, inlineHashes) => {
	let match

	// biome-ignore lint/suspicious/noAssignInExpressions: safe
	while ((match = elemRegex.exec(content)) !== null) {
		const sriHash = match[1]
		if (sriHash) {
			inlineHashes.add(sriHash)
		}
	}
}

/**
 * @param {'script' | 'style'} elemType
 * @param {string} content
 * @param {Set<string>} inlineHashes
 * @returns {string}
 */
const updateInlineSriHashes = (elemType, content, inlineHashes) => {
	let updatedContent = content
	let match

	const elemRegex = new RegExp(`<${elemType}>([\\s\\S]*?)<\\/${elemType}>`, 'g')

	// biome-ignore lint/suspicious/noAssignInExpressions: safe
	while ((match = elemRegex.exec(content)) !== null) {
		const elemContent = match[1]?.trim()

		if (elemContent) {
			const sriHash = generateSRIHash(elemContent)
			updatedContent = updatedContent.replace(
				match[0],
				`<${elemType} integrity="${sriHash}">${elemContent}</${elemType}>`,
			)
			inlineHashes.add(sriHash)
		}
	}

	return updatedContent
}

/**
 * @param {import('astro').AstroIntegrationLogger} logger
 * @param {string} distDir
 * @param {'script' | 'style'} elemType
 * @param {string} content
 * @param {Set<string>} extHashes
 * @returns {Promise<string>}
 */
const updateExternalSriHashes = async (
	logger,
	distDir,
	elemType,
	content,
	extHashes,
) => {
	let updatedContent = content
	let match

	const elemRegex =
		elemType === 'script'
			? /<script(?<attrs>\s+(type="module"\s+src="(?<href1>[\s\S]*?)"|src="(?<href2>[\s\S]*?)"\s+type="module"|src="(?<href3>[\s\S]*?)"))\s*(\/>|><\/script>)/gi
			: /<link(?<attrs>\s+(rel="stylesheet"\s+href="(?<href1>[\s\S]*?)"|href="(?<href2>[\s\S]*?)"\s+rel="stylesheet"))\s*\/>/gi

	// biome-ignore lint/suspicious/noAssignInExpressions: safe
	while ((match = elemRegex.exec(content)) !== null) {
		const attrs = match.groups?.attrs
		const href =
			match.groups?.href1 ??
			match.groups?.href2 ??
			match.groups?.href3
		if (!attrs || !href) {
			continue
		}

		/** @type {string | ArrayBuffer | Buffer} */
		let resourceContent
		if (href.startsWith('/')) {
			const resourcePath = resolve(distDir, `.${href}`)
			resourceContent = await readFile(resourcePath)
		} else if (href.startsWith('http')) {
			const resourceResponse = await fetch(href, { method: 'GET' })
			resourceContent = await resourceResponse.arrayBuffer()
		} else {
			logger.warn(`Unable to process external resource: "${href}"`)
			continue
		}

		const sriHash = generateSRIHash(resourceContent)
		updatedContent = updatedContent.replace(
			match[0],
			elemType === 'script'
				? `<script${attrs} integrity="${sriHash}" crossorigin="anonymous"></script>`
				: `<link${attrs} integrity="${sriHash}" crossorigin="anonymous"/>`,
		)
		extHashes.add(sriHash)
	}

	return updatedContent
}

/**
 * @param {import('astro').AstroIntegrationLogger} logger
 * @param {string} filePath
 * @param {string} distDir
 */
const processHTMLFile = async (logger, filePath, distDir) => {
	const content = await readFile(filePath, 'utf8')

	const inlineScriptHashes = /** @type {Set<string>} */ (new Set())
	const inlineStyleHashes = /** @type {Set<string>} */ (new Set())
	const extScriptHashes = /** @type {Set<string>} */ (new Set())
	const extStyleHashes = /** @type {Set<string>} */ (new Set())

	// Known Inline Resources (just a precaution)
	extractKnownSriHashes(
		/<script integrity="([^"]+)">/g,
		content,
		inlineScriptHashes,
	)
	extractKnownSriHashes(
		/<style integrity="([^"]+)">/g,
		content,
		inlineStyleHashes,
	)

	// Inline Resources
	let updatedContent = updateInlineSriHashes(
		'script',
		content,
		inlineScriptHashes,
	)
	updatedContent = updateInlineSriHashes(
		'style',
		updatedContent,
		inlineStyleHashes,
	)

	// External Resources
	updatedContent = await updateExternalSriHashes(
		logger,
		distDir,
		'script',
		updatedContent,
		extScriptHashes,
	)
	updatedContent = await updateExternalSriHashes(
		logger,
		distDir,
		'style',
		updatedContent,
		extStyleHashes,
	)

	if (updatedContent !== content) {
		await writeFile(filePath, updatedContent)
	}

	return {
		inlineScriptHashes,
		inlineStyleHashes,
		extScriptHashes,
		extStyleHashes,
	}
}

/**
 * @param {import('astro').AstroIntegrationLogger} logger
 * @param {string} dirPath
 * @param {string} distDir
 */
const scanDirectory = async (logger, dirPath, distDir) => {
	const inlineScriptHashes = /** @type {Set<string>} */ (new Set())
	const inlineStyleHashes = /** @type {Set<string>} */ (new Set())
	const extScriptHashes = /** @type {Set<string>} */ (new Set())
	const extStyleHashes = /** @type {Set<string>} */ (new Set())

	for (const file of await readdir(dirPath)) {
		const filePath = resolve(dirPath, file)
		const stats = await stat(filePath)

		const hashes = stats.isDirectory()
			? await scanDirectory(logger, filePath, distDir)
			: stats.isFile() && extname(file) === '.html'
			  ? await processHTMLFile(logger, filePath, distDir)
			  : undefined

		// We don't have union :(, yet
		if (hashes !== undefined) {
			for (const hash of hashes.inlineScriptHashes ?? []) {
				inlineScriptHashes.add(hash)
			}
			for (const hash of hashes.inlineStyleHashes ?? []) {
				inlineStyleHashes.add(hash)
			}
			for (const hash of hashes.extScriptHashes ?? []) {
				extScriptHashes.add(hash)
			}
			for (const hash of hashes.extStyleHashes ?? []) {
				extStyleHashes.add(hash)
			}
		}
	}

	return {
		inlineScriptHashes,
		inlineStyleHashes,
		extScriptHashes,
		extStyleHashes,
	}
}

/**
 * @param {string} path
 * @returns {Promise<boolean>}
 */
const doesFileExist = async path => {
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
const arraysEqual = (a, b) => {
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

		if ((await stat(filePath)).isFile() && (['.js', '.mjs'].includes(extname(file)))) {
			const sriHash = generateSRIHash(await readFile(filePath))
			extScriptHashes.add(sriHash)
		}
	}
}

/**
 * @param {import('astro').AstroIntegrationLogger} logger
 * @param {import('./main.d.ts').StrictSriCspOptions} sriCspOptions
 */
const generateSRIHashes = async (logger, { distDir, sriHashesModule }) => {
	const hashes = await scanDirectory(logger, distDir, distDir)

	// TODO: Remove temporary hack
	await scanForNestedScripts(distDir, hashes.extScriptHashes)

	const inlineScriptHashes = Array.from(hashes.inlineScriptHashes).sort()
	const inlineStyleHashes = Array.from(hashes.inlineStyleHashes).sort()
	const extScriptHashes = Array.from(hashes.extScriptHashes).sort()
	const extStyleHashes = Array.from(hashes.extStyleHashes).sort()

	if (!sriHashesModule) {
		return
	}

	let persistHashes = false

	if (await doesFileExist(sriHashesModule)) {
		const hashesModule = /** @type {{
			inlineScriptHashes?: string[] | undefined
			inlineStyleHashes?: string[] | undefined
			extScriptHashes?: string[] | undefined
			extStyleHashes?: string[] | undefined
		}} */ (await import(sriHashesModule))

		persistHashes =
			!arraysEqual(inlineScriptHashes, hashesModule.inlineScriptHashes ?? []) ||
			!arraysEqual(inlineStyleHashes, hashesModule.inlineStyleHashes ?? []) ||
			!arraysEqual(extScriptHashes, hashesModule.extScriptHashes ?? []) ||
			!arraysEqual(extStyleHashes, hashesModule.extStyleHashes ?? [])
	} else {
		persistHashes = true
	}

	if (persistHashes) {
		let hashesFileContent = '// Do not edit this file manually\n\n'
		hashesFileContent += `export const inlineScriptHashes = /** @type {string[]} */ (${JSON.stringify(
			inlineScriptHashes,
		)})\n\n`
		hashesFileContent += `export const inlineStyleHashes = /** @type {string[]} */ (${JSON.stringify(
			inlineStyleHashes,
		)})\n\n`
		hashesFileContent += `export const extScriptHashes = /** @type {string[]} */ (${JSON.stringify(
			extScriptHashes,
		)})\n\n`
		hashesFileContent += `export const extStyleHashes = /** @type {string[]} */ (${JSON.stringify(
			extStyleHashes,
		)})\n`

		await writeFile(sriHashesModule, hashesFileContent)
	}
}

/**
 * @param {import('./main.d.ts').SriCspOptions} sriCspOptions
 * @returns {import('astro').AstroIntegration}
 */
export const sriCSP = sriCspOptions =>
	/** @type {import('astro').AstroIntegration} */ ({
		name: 'scp-sri-postbuild',
		hooks: {
			'astro:build:done': async ({ dir, logger }) =>
				await generateSRIHashes(logger, {
					distDir: fileURLToPath(dir),
					sriHashesModule: sriCspOptions.sriHashesModule,
				}),
		},
	})

export default sriCSP
