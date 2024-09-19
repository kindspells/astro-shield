import type { CSPDirectiveNames, PerPageHashes } from './types.mts'
import type {
	CSPDirectives,
	CSPOptions,
	SecurityHeadersOptions,
} from './types.mts'

export const serialiseHashes = (hashes: Set<string>): string =>
	Array.from(hashes)
		.sort()
		.map(h => `'${h}'`)
		.join(' ')

export const serializeCspDirectiveSources = (hashes: Set<string>): string =>
	Array.from(hashes).sort().join(' ')

export const serialiseCspDirectives = (directives: CSPDirectives): string =>
	Object.entries(directives)
		.sort()
		.map(([k, v]) => `${k} ${v}`)
		.join('; ')

export const setSrcDirective = (
	directives: CSPDirectives,
	srcType: 'script-src' | 'style-src',
	hashes: Set<string>,
): void => {
	const baseSrcDirective = directives[srcType]
	if (baseSrcDirective) {
		const srcDirective = new Set(baseSrcDirective.split(spacesRegex))
		for (const hash of hashes) {
			srcDirective.add(`'${hash}'`)
		}
		directives[srcType] = serializeCspDirectiveSources(srcDirective)
	} else {
		directives[srcType] = `'self' ${serialiseHashes(hashes)}`
	}
}

const cspSplitterRegex = /;\s*/i
const spacesRegex = /\s+/i

export const parseCspDirectives = (cspHeader: string): CSPDirectives => {
	return cspHeader
		? Object.fromEntries(
				cspHeader
					.split(cspSplitterRegex)
					.filter(v => !!v)
					.map(directive => {
						// This is a hack to split the directive into _only_ two parts
						const parts = directive
							.replace(spacesRegex, '||||||')
							.split('||||||')
						return [parts[0] as CSPDirectiveNames, parts[1] ?? ''] satisfies [
							CSPDirectiveNames,
							string,
						]
					}) ?? [],
			)
		: {}
}

export const patchCspHeader = (
	plainHeaders: Record<string, string>,
	pageHashes: PerPageHashes,
	cspOpts: CSPOptions,
): void => {
	const directives = Object.hasOwn(plainHeaders, 'content-security-policy')
		? {
				...cspOpts.cspDirectives,
				...parseCspDirectives(
					plainHeaders['content-security-policy'] as string,
				),
			}
		: (cspOpts.cspDirectives ?? ({} satisfies CSPDirectives))

	if (pageHashes.scripts.size > 0) {
		setSrcDirective(directives, 'script-src', pageHashes.scripts)
	} else {
		directives['script-src'] = "'none'"
	}
	if (pageHashes.styles.size > 0) {
		setSrcDirective(directives, 'style-src', pageHashes.styles)
	} else {
		directives['style-src'] = "'none'"
	}
	if (Object.keys(directives).length > 0) {
		plainHeaders['content-security-policy'] = serialiseCspDirectives(directives)
	}
}

export const patchHeaders = (
	headers: Headers,
	pageHashes: PerPageHashes,
	securityHeadersOpts: SecurityHeadersOptions,
): Headers => {
	const plainHeaders = Object.fromEntries(headers.entries())

	if (securityHeadersOpts.contentSecurityPolicy !== undefined) {
		patchCspHeader(
			plainHeaders,
			pageHashes,
			securityHeadersOpts.contentSecurityPolicy,
		)
	}

	return new Headers(plainHeaders)
}
