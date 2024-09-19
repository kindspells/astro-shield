import { readFile, writeFile } from 'node:fs/promises'

import type {
	CSPDirectives,
	HashesCollection,
	PerPageHashes,
	SecurityHeadersOptions,
} from './types.mts'
import { serialiseCspDirectives, setSrcDirective } from './headers.mts'
import { doesFileExist } from './fs.mts'

type HeaderEntry = {
	headerName: string
	value: string
}

type CommentEntry = {
	comment: string
}

type NetlifyPathHeaders = {
	path: string
	entries: (CommentEntry | HeaderEntry)[]
}

type EmptyLine = ''

export type NetlifyHeadersRawConfig = {
	indentWith: string
	entries: (NetlifyPathHeaders | CommentEntry | EmptyLine)[]
}

const spacesRegex = /^\s+/
const headerRegex =
	/^(?<indent>\s*)(?<name>([a-zA-Z0-9_\-]+)):\s*(?<value>.*)$/i
const commentRegex = /^(?<indent>\s*)(?<comment>#.*)$/i

type ParseContext = {
	indentWith: string | undefined
	entries: NetlifyHeadersRawConfig['entries']
	currentPath: NetlifyPathHeaders | undefined
}

const tryToInitializePathConfig = (
	lineNum: number,
	line: string,
	ctx: ParseContext,
): void => {
	if (line === '') {
		ctx.entries.push(line)
	} else if (line.startsWith('#')) {
		ctx.entries.push({ comment: line })
	} else if (spacesRegex.test(line)) {
		throw new Error(`Unexpected indentation (line ${lineNum})`) // TODO: better error message, custom error
	} else if (line.startsWith('/')) {
		ctx.currentPath = { path: line, entries: [] }
		ctx.entries.push(ctx.currentPath)
	} else {
		throw new Error(`Bad syntax (line ${lineNum})`) // TODO: better error message, custom error
	}
}

const pushComment = (
	lineNum: number,
	match: RegExpMatchArray,
	currentPath: NetlifyPathHeaders | undefined,
): void => {
	if (match.groups?.comment === undefined) {
		throw new Error(`Bad syntax (line ${lineNum})`) // TODO: better error message, custom error
	}
	currentPath?.entries.push({ comment: match.groups.comment })
}

const pushHeader = (
	lineNum: number,
	match: RegExpMatchArray,
	currentPath: NetlifyPathHeaders | undefined,
): void => {
	if (match.groups?.name === undefined || match.groups?.value === undefined) {
		throw new Error(`Bad syntax (line ${lineNum})`) // TODO: better error message, custom error
	}

	currentPath?.entries.push({
		headerName: match.groups.name,
		value: match.groups.value,
	})
}

const pushEntry = (
	match: RegExpMatchArray,
	lineNum: number,
	line: string,
	pushLine: (
		lineNum: number,
		match: RegExpMatchArray,
		currentPath: NetlifyPathHeaders | undefined,
	) => void,
	ctx: ParseContext,
): void => {
	if (ctx.indentWith === undefined) {
		if (match.groups?.indent === undefined) {
			throw new Error(`Bad syntax (line ${lineNum})`) // TODO: better error message, custom error
		}
		if (match.groups?.indent === '') {
			throw new Error(`Unable to infer indentation (line ${lineNum})`) // TODO: better error message, custom error
		}
		ctx.indentWith = match.groups?.indent
	}

	if (match.groups?.indent === '') {
		if ((ctx.currentPath?.entries.length ?? 0) === 0) {
			throw new Error(`Bad syntax (line ${lineNum})`) // TODO: better error message, custom error
		}
		ctx.currentPath = undefined
		tryToInitializePathConfig(lineNum, line, ctx)
	} else if (match.groups?.indent !== ctx.indentWith) {
		throw new Error(`Unexpected indentation (line ${lineNum})`) // TODO: better error message, custom error
	} else {
		pushLine(lineNum, match, ctx.currentPath)
	}
}

const processPathLine = (
	lineNum: number,
	line: string,
	ctx: ParseContext,
): void => {
	let match: RegExpMatchArray | null = null

	// biome-ignore lint/suspicious/noAssignInExpressions: best way to do it
	if ((match = commentRegex.exec(line))) {
		pushEntry(match, lineNum, line, pushComment, ctx)
	}
	// biome-ignore lint/suspicious/noAssignInExpressions: best way to do it
	else if ((match = headerRegex.exec(line))) {
		pushEntry(match, lineNum, line, pushHeader, ctx)
	} else if (!spacesRegex.test(line)) {
		if ((ctx.currentPath?.entries.length ?? 0) === 0) {
			throw new Error(`Bad syntax (line ${lineNum})`) // TODO: better error message, custom error
		}
		ctx.currentPath = undefined
		tryToInitializePathConfig(lineNum, line, ctx)
	}
}

export const parseNetlifyHeadersConfig = (
	config: string,
): NetlifyHeadersRawConfig => {
	const ctx: ParseContext = {
		indentWith: undefined,
		entries: [],
		currentPath: undefined,
	}

	for (const [lineNum, line] of config.split('\n').entries()) {
		if (ctx.currentPath === undefined) {
			tryToInitializePathConfig(lineNum, line, ctx)
		} else {
			processPathLine(lineNum, line, ctx)
		}
	}

	return {
		indentWith: ctx.indentWith ?? '\t',
		entries: ctx.entries.at(-1) === '' ? ctx.entries.slice(0, -1) : ctx.entries,
	}
}

export const readNetlifyHeadersFile = async (
	path: string,
): Promise<NetlifyHeadersRawConfig> => {
	return parseNetlifyHeadersConfig(await readFile(path, 'utf8'))
}

export const serializeNetlifyHeadersConfig = (
	config: NetlifyHeadersRawConfig,
): string => {
	const indent = config.indentWith
	let result = ''

	for (const entry of config.entries) {
		if (entry === '') {
			result += '\n'
		} else if ('comment' in entry) {
			result += `${entry.comment}\n`
		} else if ('path' in entry) {
			result += `${entry.path}\n${entry.entries
				.map(e =>
					'comment' in e
						? `${indent}${e.comment}`
						: `${indent}${e.headerName}: ${e.value}`,
				)
				.join('\n')}\n`
		}
	}

	return result
}

const compareConfigEntries = (
	a: NetlifyPathHeaders | CommentEntry | EmptyLine,
	b: NetlifyPathHeaders | CommentEntry | EmptyLine,
): -1 | 0 | 1 => {
	// We leave comments and empty lines in place
	return a === '' || b === '' || 'comment' in a || 'comment' in b
		? 0
		: a.path < b.path
			? -1
			: a.path > b.path
				? 1
				: 0
}

/** @internal */
export const comparePathEntries = (
	a: HeaderEntry | CommentEntry,
	b: HeaderEntry | CommentEntry,
): -1 | 0 | 1 => {
	// We leave comments in place
	return 'comment' in a || 'comment' in b
		? 0
		: a.headerName < b.headerName
			? -1
			: a.headerName > b.headerName
				? 1
				: a.value < b.value // headers can have many values
					? -1
					: a.value > b.value
						? 1
						: 0
}

/** @internal */
export const comparePathEntriesSimplified = (
	a: HeaderEntry | CommentEntry,
	b: HeaderEntry | CommentEntry,
): -1 | 0 | 1 => {
	// We leave comments in place
	return 'comment' in a || 'comment' in b
		? 0
		: a.headerName < b.headerName
			? -1
			: a.headerName > b.headerName
				? 1
				: 0
}

export const buildNetlifyHeadersConfig = (
	securityHeadersOptions: SecurityHeadersOptions,
	resourceHashes: Pick<HashesCollection, 'perPageSriHashes'>,
): NetlifyHeadersRawConfig => {
	const config: NetlifyHeadersRawConfig = {
		indentWith: '\t',
		entries: [],
	}

	const pagesToIterate: [string, PerPageHashes][] = []
	for (const [page, hashes] of resourceHashes.perPageSriHashes) {
		if (page === 'index.html' || page.endsWith('/index.html')) {
			pagesToIterate.push([page.slice(0, -10), hashes])
		}
		pagesToIterate.push([page, hashes])
	}
	pagesToIterate.sort()

	for (const [page, hashes] of pagesToIterate) {
		const pathEntries: (HeaderEntry | CommentEntry)[] = []

		if (securityHeadersOptions.contentSecurityPolicy !== undefined) {
			const directives: CSPDirectives =
				securityHeadersOptions.contentSecurityPolicy.cspDirectives ?? {}

			if (hashes.scripts.size > 0) {
				setSrcDirective(directives, 'script-src', hashes.scripts)
			} else {
				directives['script-src'] = "'none'"
			}
			if (hashes.styles.size > 0) {
				setSrcDirective(directives, 'style-src', hashes.styles)
			} else {
				directives['style-src'] = "'none'"
			}

			if (Object.keys(directives).length === 0) {
				continue
			}

			pathEntries.push({
				headerName: 'content-security-policy',
				value: serialiseCspDirectives(directives),
			})
		}

		if (pathEntries.length > 0) {
			config.entries.push({
				path: `/${page}`,
				entries: pathEntries.sort(comparePathEntries),
			})
		}
	}

	return config
}

const mergeNetlifyPathHeaders = (
	base: (HeaderEntry | CommentEntry)[],
	patch: (HeaderEntry | CommentEntry)[],
): (HeaderEntry | CommentEntry)[] => {
	const merged: (HeaderEntry | CommentEntry)[] = []

	let baseIndex = 0
	let patchIndex = 0
	while (baseIndex < base.length && patchIndex < patch.length) {
		// biome-ignore lint/style/noNonNullAssertion: element is guaranteed to exist
		const baseEntry = base[baseIndex]!
		// biome-ignore lint/style/noNonNullAssertion: element is guaranteed to exist
		const patchEntry = patch[patchIndex]!

		switch (comparePathEntriesSimplified(baseEntry, patchEntry)) {
			case -1: {
				merged.push(baseEntry)
				baseIndex += 1
				break
			}
			case 0: {
				if ('comment' in patchEntry) {
					patchIndex += 1 // We discard comments in the patch
				} else if ('comment' in baseEntry) {
					merged.push(baseEntry)
					baseIndex += 1
				} else {
					merged.push(patchEntry)
					baseIndex += 1
					patchIndex += 1
				}
				break
			}
			case 1: {
				merged.push(patchEntry)
				patchIndex += 1
				break
			}
			default: {
				throw new Error('Unreachable')
			}
		}
	}
	for (; baseIndex < base.length; baseIndex += 1) {
		// biome-ignore lint/style/noNonNullAssertion: guaranteed to exist
		merged.push(base[baseIndex]!)
	}
	for (; patchIndex < patch.length; patchIndex += 1) {
		// biome-ignore lint/style/noNonNullAssertion: guaranteed to exist
		merged.push(patch[patchIndex]!)
	}

	return merged
}

export const mergeNetlifyHeadersConfig = (
	base: NetlifyHeadersRawConfig,
	patch: NetlifyHeadersRawConfig,
): NetlifyHeadersRawConfig => {
	const indentWith = base.indentWith
	const baseEntries = base.entries.slice().sort(compareConfigEntries)
	const patchEntries = patch.entries.slice().sort(compareConfigEntries)
	const mergedEntries: NetlifyHeadersRawConfig['entries'] = []

	let baseIndex = 0
	let patchIndex = 0
	while (baseIndex < baseEntries.length && patchIndex < patchEntries.length) {
		// biome-ignore lint/style/noNonNullAssertion: element is guaranteed to exist
		const baseEntry = baseEntries[baseIndex]!
		// biome-ignore lint/style/noNonNullAssertion: element is guaranteed to exist
		const patchEntry = patchEntries[patchIndex]!

		switch (compareConfigEntries(baseEntry, patchEntry)) {
			case -1: {
				if (
					!(
						typeof baseEntry === 'object' &&
						'entries' in baseEntry &&
						baseEntry.entries.length === 0
					)
				) {
					// We discard entries with no headers nor comments
					mergedEntries.push(baseEntry)
				}
				baseIndex += 1
				break
			}
			case 0: {
				if (patchEntry === '' || 'comment' in patchEntry) {
					patchIndex += 1 // We discard comments in the patch
				} else if (baseEntry === '' || 'comment' in baseEntry) {
					mergedEntries.push(patchEntry)
					patchIndex += 1
				} else if (baseEntry.path === patchEntry.path) {
					mergedEntries.push({
						path: baseEntry.path,
						entries: mergeNetlifyPathHeaders(
							baseEntry.entries,
							patchEntry.entries,
						),
					})
					baseIndex += 1
					patchIndex += 1
				} else {
					throw new Error('Unreachable')
				}
				break
			}
			case 1: {
				if (
					!(
						typeof patchEntry === 'object' &&
						'entries' in patchEntry &&
						patchEntry.entries.length === 0
					)
				) {
					// We discard entries with no headers nor comments
					mergedEntries.push(patchEntry)
				}
				patchIndex += 1
				break
			}
			default:
				throw new Error('Unreachable')
		}
	}
	for (; baseIndex < baseEntries.length; baseIndex += 1) {
		// biome-ignore lint/style/noNonNullAssertion: element is guaranteed to exist
		mergedEntries.push(baseEntries[baseIndex]!)
	}
	for (; patchIndex < patchEntries.length; patchIndex += 1) {
		// biome-ignore lint/style/noNonNullAssertion: element is guaranteed to exist
		mergedEntries.push(patchEntries[patchIndex]!)
	}

	return {
		indentWith,
		entries: mergedEntries,
	}
}

export const patchNetlifyHeadersConfig = async (
	configPath: string,
	securityHeadersOptions: SecurityHeadersOptions,
	resourceHashes: Pick<HashesCollection, 'perPageSriHashes'>,
): Promise<void> => {
	const baseConfig = (await doesFileExist(configPath))
		? await readNetlifyHeadersFile(configPath)
		: { indentWith: '\t', entries: [] }

	const patchConfig = buildNetlifyHeadersConfig(
		securityHeadersOptions,
		resourceHashes,
	)

	const mergedConfig = mergeNetlifyHeadersConfig(baseConfig, patchConfig)

	await writeFile(configPath, serializeNetlifyHeadersConfig(mergedConfig))
}
