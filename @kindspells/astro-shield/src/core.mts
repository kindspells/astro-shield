/*
 * SPDX-FileCopyrightText: 2024 KindSpells Labs S.L.
 *
 * SPDX-License-Identifier: MIT
 */

import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, extname, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import type { AstroIntegration, MiddlewareHandler } from 'astro'
import type { Plugin } from 'vite'

import { doesFileExist, scanDirectory } from './fs.mts'
import { patchHeaders } from './headers.mts'
import type {
	HashesCollection,
	Logger,
	MiddlewareHashes,
	PerPageHashes,
	SecurityHeadersOptions,
	SRIOptions,
	StrictShieldOptions,
} from './types.mts'

export type HashesModule = {
	[k in keyof HashesCollection]: HashesCollection[k] extends Set<string>
		? string[] | undefined
		: k extends 'perPageSriHashes'
			? Record<string, { scripts: string[]; styles: string[] }>
			: Record<'scripts' | 'styles', Record<string, string>>
}

const exhaustiveGuard = (_v: never, caseName: string): void => {
	throw new Error(`Unknown ${caseName}: ${_v}`)
}

export const generateSRIHash = (
	data: string | ArrayBuffer | Buffer,
): string => {
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

type ElemReplacer = (
	hash: string,
	attrs: string,
	setCrossorigin: boolean,
	content?: string | undefined,
) => string

const scriptReplacer: ElemReplacer = (hash, attrs, setCrossorigin, content) =>
	`<script${attrs} integrity="${hash}"${
		setCrossorigin ? ' crossorigin="anonymous"' : ''
	}>${content ?? ''}</script>`

const styleReplacer: ElemReplacer = (hash, attrs, setCrossorigin, content) =>
	`<style${attrs} integrity="${hash}"${
		setCrossorigin ? ' crossorigin="anonymous"' : ''
	}>${content ?? ''}</style>`

const linkStyleReplacer: ElemReplacer = (hash, attrs, setCrossorigin) =>
	`<link${attrs} integrity="${hash}"${
		setCrossorigin ? ' crossorigin="anonymous"' : ''
	}/>`

const urlLikeRegex = /^(https?:)?\/\/[^/]/i
const anonymousCrossOriginRegex =
	/crossorigin\s*=\s*("anonymous"|'anonymous'|anonymous)/i
const integrityRegex =
	/^integrity\s*=\s*("(?<integrity1>sha256-[a-z0-9+\/]{43}=)"|'(?<integrity2>sha256-[a-z0-9+\/]{43}=)')$/i
const relStylesheetRegex =
	/(^|\s+)rel\s*=\s*('stylesheet'|"stylesheet"|stylesheet(\s+?|$))/i
const naiveAttrSplitter = /(?<!=)\s+(?!=)/

const extractIntegrityHash = (attrs: string): string | undefined => {
	for (const attr of attrs.split(naiveAttrSplitter)) {
		// If longer than 128, it's either not an integrity attribute, or an attempt
		// to perform a DoS attack.
		if (attr.length <= 128) {
			const m = integrityRegex.exec(attr)
			if (m) {
				return m.groups?.integrity1 ?? m.groups?.integrity2
			}
		}
	}
	return undefined
}

export const regexProcessors = [
	{
		t: 'Script' as const,
		t2: 'scripts' as const,
		regex:
			/<script(?<attrs>(\s+[a-z][a-z0-9\-_]*(\s*=\s*('[^']*'|"[^"]*"|[a-z0-9\-_\/\.]+))?)*?)\s*>(?<content>[\s\S]*?)<\/\s*script((?<closingTrick>(\s+[a-z][a-z0-9\-_]*(\s*=\s*('[^']*'|"[^"]*"|[a-z0-9\-_]+))?)+?)|\s*>)/gi,
		srcRegex:
			/(^|\s+)src\s*=\s*("(?<src1>[^"]*)"|'(?<src2>[^']*)'|(?<src3>[a-z0-9\-_\/\.]+))/i,
		replacer: scriptReplacer,
		hasContent: true,
		attrsRegex: undefined,
	},
	{
		t: 'Style' as const,
		t2: 'styles' as const,
		regex:
			/<style(?<attrs>(\s+[a-z][a-z0-9\-_]*(\s*=\s*('[^']*'|"[^"]*"|[a-z0-9\-_\/\.]+))?)*?)\s*>(?<content>[\s\S]*?)<\/\s*style((?<closingTrick>(\s+[a-z][a-z0-9\-_]*(\s*=\s*('[^']*'|"[^"]*"|[a-z0-9\-_]+))?)+?)|\s*>)/gi,
		srcRegex:
			/(^|\s+)(href|src)\s*=\s*("(?<src1>[^"]*)"|'(?<src2>[^']*)'|(?<src3>[a-z0-9\-_\/\.]+))/i, // not really used
		replacer: styleReplacer,
		hasContent: true,
		attrsRegex: undefined,
	},
	{
		t: 'Style' as const,
		t2: 'styles' as const,
		regex:
			/<link(?<attrs>(\s+[a-z][a-z0-9\-_]*(\s*=\s*('[^']*'|"[^"]*"|[a-z0-9\-_\/\.]+))?)*?)\s*\/?>/gi,
		srcRegex:
			/(^|\s+)href\s*=\s*("(?<src1>[^"]*)"|'(?<src2>[^']*)'|(?<src3>[a-z0-9\-_\/\.]+))/i,
		replacer: linkStyleReplacer,
		hasContent: false,
		attrsRegex: relStylesheetRegex,
	},
] as const

/**
 * This function extracts SRI hashes from inline and external resources, and
 * adds the integrity attribute to the related HTML elements.
 *
 * Notice that it assumes that the HTML content is relatively well-formed, and
 * that in case it already contains integrity attributes then they are correct.
 */
export const updateStaticPageSriHashes = async (
	logger: Logger,
	distDir: string,
	relativeFilepath: string,
	content: string,
	h: HashesCollection,
	allowInlineScripts: 'all' | 'static' | false = 'all',
	allowInlineStyles: 'all' | 'static' | false = 'all',
): Promise<string> => {
	const pageHashes =
		h.perPageSriHashes.get(relativeFilepath) ??
		({
			scripts: new Set(),
			styles: new Set(),
		} satisfies PerPageHashes)
	h.perPageSriHashes.set(relativeFilepath, pageHashes)

	let updatedContent = content
	let match: RegExpExecArray | null

	for (const {
		attrsRegex,
		hasContent,
		regex,
		srcRegex,
		replacer,
		t,
		t2,
	} of regexProcessors) {
		regex.lastIndex = 0 // We have to reset `regex`'s state, because it's "global"

		// biome-ignore lint/suspicious/noAssignInExpressions: safe
		while ((match = regex.exec(content)) !== null) {
			const attrs = match.groups?.attrs?.trim() ?? ''
			const elemContent = match.groups?.content ?? ''

			let sriHash: string | undefined = undefined
			let setCrossorigin = false

			if (attrs) {
				if (attrsRegex && !attrsRegex.test(attrs)) {
					continue
				}

				const srcMatch = srcRegex.exec(attrs)
				const src =
					srcMatch?.groups?.src1 ??
					srcMatch?.groups?.src2 ??
					srcMatch?.groups?.src3 ??
					''

				if (elemContent && src) {
					logger.warn(
						`${t} "${src}" must have either a src/href attribute or content, but not both. Removing it.`,
					)
					updatedContent = updatedContent.replace(match[0], '')
					continue
				}

				const givenSriHash = extractIntegrityHash(attrs)

				if (givenSriHash !== undefined) {
					if (givenSriHash) {
						;(srcMatch ? h[`ext${t}Hashes`] : h[`inline${t}Hashes`]).add(
							givenSriHash,
						)
						pageHashes[t2].add(givenSriHash)
						if (src) {
							h.perResourceSriHashes[t2].set(src, givenSriHash)
						}
					} else {
						logger.warn(
							`Found empty integrity attribute in "${relativeFilepath}".`,
						)
					}
					continue
				}

				if (src) {
					const cachedHash = h.perResourceSriHashes[t2].get(src)
					if (cachedHash) {
						sriHash = cachedHash
						h[`ext${t}Hashes`].add(sriHash)
						pageHashes[t2].add(sriHash)
					} else {
						let resourceContent: string | ArrayBuffer | Buffer
						if (urlLikeRegex.test(src)) {
							setCrossorigin = true
							const resourceResponse = await fetch(
								src.startsWith('//') ? `https:${src}` : src,
								{ method: 'GET' },
							)
							resourceContent = await resourceResponse.arrayBuffer()
						} else if (src.startsWith('/')) {
							const resourcePath = resolve(distDir, `.${src}`)
							resourceContent = await readFile(resourcePath)
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
				if (
					!(allowInlineScripts === false && t === 'Script') &&
					!(allowInlineStyles === false && t === 'Style')
				) {
					sriHash = generateSRIHash(elemContent)
					h[`inline${t}Hashes`].add(sriHash)
					pageHashes[t2].add(sriHash)
				} else {
					logger.warn(
						`Removing inline ${t.toLowerCase()} block (inline ${t2} are disabled).`,
					)
					updatedContent = updatedContent.replace(match[0], '')
					continue
				}
			}

			if (sriHash) {
				const hasAnonymousCrossOrigin = anonymousCrossOriginRegex.test(attrs)

				updatedContent = updatedContent.replace(
					match[0],
					replacer(
						sriHash,
						attrs ? ` ${attrs}` : '',
						setCrossorigin && !hasAnonymousCrossOrigin,
						elemContent,
					),
				)
			}
		}
	}

	return updatedContent
}

export const updateDynamicPageSriHashes = (
	logger: Logger,
	content: string,
	globalHashes: MiddlewareHashes,
	sri?: SRIOptions,
): { pageHashes: PerPageHashes; updatedContent: string } => {
	let updatedContent = content
	let match: RegExpExecArray | null

	const pageHashes: PerPageHashes = {
		scripts: new Set(),
		styles: new Set(),
	}

	for (const {
		attrsRegex,
		hasContent,
		regex,
		srcRegex,
		replacer,
		t,
		t2,
	} of regexProcessors) {
		regex.lastIndex = 0 // We have to reset `regex`'s state, because it's "global"

		// biome-ignore lint/suspicious/noAssignInExpressions: safe
		while ((match = regex.exec(content)) !== null) {
			const attrs = match.groups?.attrs?.trim() ?? ''
			const elemContent = match.groups?.content ?? ''

			let sriHash: string | undefined = undefined
			let setCrossorigin = false

			if (attrs) {
				// This is to skip <link> elements that are not stylesheets
				if (attrsRegex && !attrsRegex.test(attrs)) {
					continue
				}

				const srcMatch = srcRegex.exec(attrs)
				const src =
					srcMatch?.groups?.src1 ??
					srcMatch?.groups?.src2 ??
					srcMatch?.groups?.src3

				if (elemContent && src) {
					logger.warn(
						`${t} "${src}" must have either a src/href attribute or content, but not both. Removing it.`,
					)
					updatedContent = updatedContent.replace(match[0], '')
					continue
				}

				const givenSriHash = extractIntegrityHash(attrs)

				if (givenSriHash !== undefined) {
					if (givenSriHash) {
						if (src) {
							const globalHash = globalHashes[t2].get(src)
							if (globalHash) {
								if (globalHash !== givenSriHash) {
									logger.warn(
										`Detected integrity hash mismatch for resource "${src}". Removing it.`,
									)
									updatedContent = updatedContent.replace(match[0], '')
								} else {
									sriHash = givenSriHash
									pageHashes[t2].add(sriHash)
								}
							} else {
								logger.warn(
									`Detected reference to not explicitly allowed external resource "${src}". Removing it.`,
								)
								updatedContent = updatedContent.replace(match[0], '')
							}
						} else if (elemContent) {
							if (
								(t2 === 'scripts' &&
									(sri?.allowInlineScripts ?? 'all') === 'all') ||
								(t2 === 'styles' && (sri?.allowInlineStyles ?? 'all') === 'all')
							) {
								sriHash = givenSriHash
								pageHashes[t2].add(sriHash)
							} else {
								logger.warn(
									`Removing inline ${t.toLowerCase()} block (inline ${t2} are disabled).`,
								)
								updatedContent = updatedContent.replace(match[0], '')
							}
						}
					} else {
						logger.warn(
							`Found empty integrity attribute, removing inline ${t.toLowerCase()} block.`,
						)
						updatedContent = updatedContent.replace(match[0], '')
					}
					continue
				}

				if (src) {
					if (urlLikeRegex.test(src)) {
						setCrossorigin = true
						sriHash = globalHashes[t2].get(src)

						if (sriHash) {
							pageHashes[t2].add(sriHash)
						} else {
							logger.warn(
								`Detected reference to not explicitly allowed external resource "${src}". Removing it.`,
							)
							updatedContent = updatedContent.replace(match[0], '')
							continue
						}
					} else if (src.startsWith('/')) {
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
								// TODO: Perform fetch operation when running in dev mode
								logger.warn(
									`Unable to obtain SRI hash for local resource: "${src}"`,
								)
							}
							continue
						}
					} else {
						// TODO: Introduce flag to decide if external resources using unknown protocols should be removed
						logger.warn(`Unable to process external resource: "${src}".`)
						continue
					}
				}
			}

			if (hasContent && !sriHash) {
				if (
					((sri?.allowInlineScripts ?? 'all') === 'all' && t === 'Script') ||
					((sri?.allowInlineStyles ?? 'all') === 'all' && t === 'Style')
				) {
					sriHash = generateSRIHash(elemContent)
					pageHashes[t2].add(sriHash)
				} else {
					logger.warn(
						`Removing inline ${t.toLowerCase()} block (inline ${t2} are disabled)`,
					)
					updatedContent = updatedContent.replace(match[0], '')
					continue
				}
			}

			if (sriHash) {
				const hasAnonymousCrossOrigin = anonymousCrossOriginRegex.test(attrs)

				updatedContent = updatedContent.replace(
					match[0],
					replacer(
						sriHash,
						attrs ? ` ${attrs}` : '',
						setCrossorigin && !hasAnonymousCrossOrigin,
						elemContent,
					),
				)
			}
		}
	}

	return {
		pageHashes,
		updatedContent,
	}
}

const processHTMLFile = async (
	logger: Logger,
	filePath: string,
	distDir: string,
	h: HashesCollection,
	sri?: SRIOptions,
) => {
	const content = await readFile(filePath, 'utf8')
	const updatedContent = await updateStaticPageSriHashes(
		logger,
		distDir,
		relative(distDir, filePath),
		content,
		h,
		sri?.allowInlineScripts ?? 'all',
		sri?.allowInlineStyles ?? 'all',
	)

	if (updatedContent !== content) {
		await writeFile(filePath, updatedContent)
	}
}

export const arraysEqual = (a: unknown[], b: unknown[]): boolean => {
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

export const pageHashesEqual = (
	a: Record<string, { scripts: string[]; styles: string[] }>,
	b: Record<string, { scripts: string[]; styles: string[] }>,
): boolean => {
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

export const sriHashesEqual = (
	a: { scripts: Record<string, string>; styles: Record<string, string> },
	b: { scripts: Record<string, string>; styles: Record<string, string> },
): boolean => {
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
 */
export const scanForNestedResources = async (
	logger: Logger,
	dirPath: string,
	h: HashesCollection,
): Promise<void> => {
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

export const scanAllowLists = async (
	sri: Pick<SRIOptions, 'scriptsAllowListUrls' | 'stylesAllowListUrls'>,
	h: HashesCollection,
): Promise<void> => {
	for (const scriptUrl of sri.scriptsAllowListUrls ?? []) {
		const resourceResponse = await fetch(scriptUrl, { method: 'GET' })
		const resourceContent = await resourceResponse.arrayBuffer()
		const sriHash = generateSRIHash(resourceContent)

		h.extScriptHashes.add(sriHash)
		h.perResourceSriHashes.scripts.set(scriptUrl, sriHash)
	}

	for (const styleUrl of sri.stylesAllowListUrls ?? []) {
		const resourceResponse = await fetch(styleUrl, { method: 'GET' })
		const resourceContent = await resourceResponse.arrayBuffer()
		const sriHash = generateSRIHash(resourceContent)

		h.extStyleHashes.add(sriHash)
		h.perResourceSriHashes.styles.set(styleUrl, sriHash)
	}
}

export async function generateSRIHashesModule(
	logger: Logger,
	h: HashesCollection,
	sriHashesModule: string,
	enableMiddleware_SRI: boolean,
): Promise<void> {
	let extResourceHashesChanged = false
	let persistHashes = false

	const inlineScriptHashes = Array.from(h.inlineScriptHashes).sort()
	const inlineStyleHashes = Array.from(h.inlineStyleHashes).sort()
	const extScriptHashes = Array.from(h.extScriptHashes).sort()
	const extStyleHashes = Array.from(h.extStyleHashes).sort()
	const perPageHashes: Record<string, { scripts: string[]; styles: string[] }> =
		{}

	for (const [k, v] of h.perPageSriHashes.entries()) {
		perPageHashes[k] = {
			scripts: Array.from(v.scripts).sort(),
			styles: Array.from(v.styles).sort(),
		}
	}

	const perResourceHashes: {
		scripts: Record<string, string>
		styles: Record<string, string>
	} = { scripts: {}, styles: {} }

	for (const [k, v] of h.perResourceSriHashes.scripts.entries()) {
		perResourceHashes.scripts[k] = v
	}

	for (const [k, v] of h.perResourceSriHashes.styles.entries()) {
		perResourceHashes.styles[k] = v
	}

	if (await doesFileExist(sriHashesModule)) {
		const hModule: HashesModule = await import(
			/* @vite-ignore */ sriHashesModule
		)

		extResourceHashesChanged = !sriHashesEqual(
			perResourceHashes,
			hModule.perResourceSriHashes ?? { scripts: {}, styles: {} },
		)
		persistHashes =
			extResourceHashesChanged ||
			!arraysEqual(inlineScriptHashes, hModule.inlineScriptHashes ?? []) ||
			!arraysEqual(inlineStyleHashes, hModule.inlineStyleHashes ?? []) ||
			!arraysEqual(extScriptHashes, hModule.extScriptHashes ?? []) ||
			!arraysEqual(extStyleHashes, hModule.extStyleHashes ?? []) ||
			!pageHashesEqual(perPageHashes, hModule.perPageSriHashes ?? {})
	} else {
		persistHashes = true
	}

	if (persistHashes) {
		if (extResourceHashesChanged && enableMiddleware_SRI) {
			logger.warn(
				'SRI hashes have changed for static resources that may be used in dynamic pages. You should run the build step again',
			)
		}

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

		await mkdir(dirname(sriHashesModule), { recursive: true })
		await writeFile(sriHashesModule, hashesFileContent)
	}
}

export const processStaticFiles = async (
	logger: Logger,
	{ distDir, sri, securityHeaders }: StrictShieldOptions,
): Promise<void> => {
	const h = {
		inlineScriptHashes: new Set(),
		inlineStyleHashes: new Set(),
		extScriptHashes: new Set(),
		extStyleHashes: new Set(),
		perPageSriHashes: new Map(),
		perResourceSriHashes: {
			scripts: new Map(),
			styles: new Map(),
		},
	} satisfies HashesCollection

	await scanAllowLists(sri, h)
	await scanForNestedResources(logger, distDir, h)
	await scanDirectory(
		logger,
		distDir,
		distDir,
		h,
		processHTMLFile,
		file => extname(file) === '.html',
		sri,
	)

	if (!sri.hashesModule) {
		return
	}

	await generateSRIHashesModule(
		logger,
		h,
		sri.hashesModule,
		sri.enableMiddleware,
	)

	if (securityHeaders?.enableOnStaticPages !== undefined) {
		const provider = securityHeaders.enableOnStaticPages.provider
		switch (provider) {
			case 'netlify':
				break
			case 'vercel':
				throw new Error('Vercel provider is still not supported')
			default:
				exhaustiveGuard(provider, 'provider')
		}
	}
}

export const getMiddlewareHandler = (
	logger: Logger,
	globalHashes: MiddlewareHashes,
	sri: Required<SRIOptions>,
): MiddlewareHandler => {
	return (async (_ctx, next) => {
		const response = await next()
		const content = await response.text()

		const { updatedContent } = updateDynamicPageSriHashes(
			logger,
			content,
			globalHashes,
			sri,
		)

		const patchedResponse = new Response(updatedContent, {
			status: response.status,
			statusText: response.statusText,
			headers: response.headers,
		})
		return patchedResponse
	}) satisfies MiddlewareHandler
}

/**
 * Variant of `getMiddlewareHandler` that also applies security headers.
 */
export const getCSPMiddlewareHandler = (
	logger: Logger,
	globalHashes: MiddlewareHashes,
	securityHeadersOpts: SecurityHeadersOptions,
	sri: Required<SRIOptions>,
): MiddlewareHandler => {
	return (async (_ctx, next) => {
		const response = await next()
		const content = await response.text()

		const { updatedContent, pageHashes } = updateDynamicPageSriHashes(
			logger,
			content,
			globalHashes,
			sri,
		)

		const patchedResponse = new Response(updatedContent, {
			status: response.status,
			statusText: response.statusText,
			headers: patchHeaders(response.headers, pageHashes, securityHeadersOpts),
		})
		return patchedResponse
	}) satisfies MiddlewareHandler
}

const middlewareVirtualModuleId = 'virtual:@kindspells/astro-shield/middleware'
const resolvedMiddlewareVirtualModuleId = `\0${middlewareVirtualModuleId}`

const loadVirtualMiddlewareModule = async (
	logger: Logger,
	sri: Required<SRIOptions>,
	securityHeadersOptions: SecurityHeadersOptions | undefined,
	publicDir: string,
): Promise<string> => {
	let extraImports = ''
	let staticHashesModuleLoader = ''

	if (sri.enableStatic && sri.hashesModule) {
		let shouldRegenerateHashesModule = !(await doesFileExist(sri.hashesModule))

		if (!shouldRegenerateHashesModule) {
			try {
				const hashesModule: HashesModule = await import(
					/* @vite-ignore */ sri.hashesModule
				)

				for (const allowedScript of sri.scriptsAllowListUrls) {
					if (
						!Object.hasOwn(
							hashesModule.perResourceSriHashes.scripts,
							allowedScript,
						)
					) {
						shouldRegenerateHashesModule = true
						break
					}
				}
			} catch (err) {
				logger.warn(
					`Failed to load SRI hashes module "${sri.hashesModule}", it will be re-generated:\n\t${err}`,
				)
				shouldRegenerateHashesModule = true
			}
		}

		if (shouldRegenerateHashesModule) {
			const h = {
				inlineScriptHashes: new Set(),
				inlineStyleHashes: new Set(),
				extScriptHashes: new Set(),
				extStyleHashes: new Set(),
				perPageSriHashes: new Map(),
				perResourceSriHashes: {
					scripts: new Map(),
					styles: new Map(),
				},
			} satisfies HashesCollection

			// We generate a provisional hashes module. It won't contain the hashes for
			// resources created by Astro, but it can be useful nonetheless.
			await scanForNestedResources(logger, publicDir, h)
			await scanAllowLists(sri, h)
			await generateSRIHashesModule(
				logger,
				h,
				sri.hashesModule,
				false, // So we don't get redundant warnings
			)
		}
	}

	if (
		sri.enableStatic &&
		sri.hashesModule &&
		(await doesFileExist(sri.hashesModule))
	) {
		extraImports = `import { perResourceSriHashes } from '${sri.hashesModule}'`
		staticHashesModuleLoader = `
try {
	if (perResourceSriHashes) {
		for (const [key, value] of Object.entries(
			perResourceSriHashes.scripts ?? {},
		)) {
			globalHashes.scripts.set(key, value)
		}
		for (const [key, value] of Object.entries(
			perResourceSriHashes.styles ?? {},
		)) {
			globalHashes.styles.set(key, value)
		}
	}
} catch (err) {
	console.error('Failed to load static hashes module:', err)
}
`
	} else if (sri.enableStatic && sri.hashesModule) {
		// Highly unlikely that this happens because of the provisional hashes
		// module, but the world is a strange place.
		logger.warn(
			`The SRI hashes module "${sri.hashesModule}" did not exist at build time. You may have to run the build step again`,
		)
	}

	return `
import { defineMiddleware } from 'astro/middleware'
import { getGlobalHashes } from '@kindspells/astro-shield/state'
import { ${
		securityHeadersOptions !== undefined
			? 'getCSPMiddlewareHandler'
			: 'getMiddlewareHandler'
	} } from '@kindspells/astro-shield/core'
${extraImports}

export const onRequest = await (async () => {
	const globalHashes = await getGlobalHashes()

	${staticHashesModuleLoader}

	return defineMiddleware(${
		securityHeadersOptions !== undefined
			? `getCSPMiddlewareHandler(console, globalHashes, ${JSON.stringify(
					securityHeadersOptions,
				)}, ${JSON.stringify(sri)})`
			: `getMiddlewareHandler(console, globalHashes, ${JSON.stringify(sri)})`
	})
})()
`
}

const getViteMiddlewarePlugin = (
	logger: Logger,
	sri: Required<SRIOptions>,
	securityHeaders: SecurityHeadersOptions | undefined,
	publicDir: string,
): Plugin => {
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
						sri,
						securityHeaders,
						publicDir,
					)
				default:
					return
			}
		},
	}
}

/**
 * @param {Required<SRIOptions>} sri
 * @param {SecurityHeadersOptions | undefined} securityHeaders
 * @returns
 */
export const getAstroConfigSetup = (
	sri: Required<SRIOptions>,
	securityHeaders: SecurityHeadersOptions | undefined,
): Required<AstroIntegration['hooks']>['astro:config:setup'] => {
	// biome-ignore lint/suspicious/useAwait: We have to conform to the Astro API
	return async ({ logger, addMiddleware, config, updateConfig }) => {
		const publicDir = fileURLToPath(config.publicDir)
		const plugin = getViteMiddlewarePlugin(
			logger,
			sri,
			securityHeaders,
			publicDir,
		)
		updateConfig({ vite: { plugins: [plugin] } })

		addMiddleware({
			order: 'post',
			entrypoint: 'virtual:@kindspells/astro-shield/middleware',
		})
	}
}
