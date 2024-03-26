/**
 * @typedef {import('./core.d.ts').PerPageHashes} PerPageHashes
 * @typedef {import('./main.d.ts').CSPDirectiveNames} CSPDirectiveNames
 * @typedef {import('./main.d.ts').CSPDirectives} CSPDirectives
 * @typedef {import('./main.d.ts').SecurityHeadersOptions} SecurityHeadersOptions
 */

/**
 * @param {Set<string>} hashes
 * @returns {string}
 */
export const serialiseHashes = hashes =>
	Array.from(hashes)
		.sort()
		.map(h => `'${h}'`)
		.join(' ')

/**
 * @param {Set<string>} hashes
 * @returns {string}
 */
export const safeSerialiseHashes = hashes =>
	Array.from(hashes)
		.sort()
		.map(h => (h.match(/^'[^']+'$/i) ? h : `'${h}'`))
		.join(' ')

/**
 * @param {CSPDirectives} directives
 * @returns {string}
 */
export const serialiseCspDirectives = directives =>
	Object.entries(directives)
		.sort()
		.map(([k, v]) => `${k} ${v}`)
		.join('; ')

/**
 *
 * @param {CSPDirectives} directives
 * @param {'script-src' | 'style-src'} srcType
 * @param {Set<string>} hashes
 */
export const setSrcDirective = (directives, srcType, hashes) => {
	const baseSrcDirective = directives[srcType]
	if (baseSrcDirective) {
		const srcDirective = new Set(
			baseSrcDirective.split(/\s+/).filter(v => v !== "'self'"),
		)
		for (const hash of hashes) {
			srcDirective.add(`'${hash}'`)
		}
		directives[srcType] = `'self' ${safeSerialiseHashes(srcDirective)}`
	} else {
		directives[srcType] = `'self' ${serialiseHashes(hashes)}`
	}
}

/**
 * @param {string} cspHeader
 * @returns {CSPDirectives}
 */
export const parseCspDirectives = cspHeader => {
	return cspHeader
		? Object.fromEntries(
				cspHeader
					.split(/;\s*/i)
					.filter(v => !!v)
					.map(directive => {
						// This is a hack to split the directive into _only_ two parts
						const parts = directive.replace(/\s+/, '||||||').split('||||||')
						return /** @type {[CSPDirectiveNames, string]} */ ([
							parts[0],
							parts[1] ?? '',
						])
					}) ?? [],
			)
		: {}
}

/**
 * @param {Headers} headers
 * @param {PerPageHashes} pageHashes
 * @param {SecurityHeadersOptions} securityHeadersOpts
 * @returns {Headers}
 */
export const patchHeaders = (headers, pageHashes, securityHeadersOpts) => {
	const directives = headers.has('content-security-policy')
		? {
				...securityHeadersOpts.contentSecurityPolicy?.cspDirectives,
				...parseCspDirectives(
					/** @type {string} */ (headers.get('content-security-policy')),
				),
			}
		: securityHeadersOpts.contentSecurityPolicy?.cspDirectives ??
			/** @type {CSPDirectives} */ ({})

	const plainHeaders = Object.fromEntries(headers.entries())

	if (pageHashes.scripts.size > 0) {
		setSrcDirective(directives, 'script-src', pageHashes.scripts)
	}
	if (pageHashes.styles.size > 0) {
		setSrcDirective(directives, 'style-src', pageHashes.styles)
	}
	if (Object.keys(directives).length > 0) {
		plainHeaders['content-security-policy'] = serialiseCspDirectives(directives)
	}

	return new Headers(plainHeaders)
}
