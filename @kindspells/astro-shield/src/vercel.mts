import { resolve } from 'node:path'
import type {
	CSPDirectives,
	Logger,
	PerPageHashes,
	PerPageHashesCollection,
	SecurityHeadersOptions,
} from './types.mts'
import { doesFileExist } from './fs.mts'
import { readFile, writeFile, readdir } from 'node:fs/promises'
import type { AstroConfig } from 'astro'
import { serialiseCspDirectives, setSrcDirective } from './headers.mts'

type VercelRoute = {
	src: string
	headers?: Record<string, string>
	status?: number
	[key: string]: unknown
}

type VercelConfigV3 = {
	version: number
	routes?: VercelRoute[]
}

export type VercelConfig = VercelConfigV3

const vercelAdapterDistRegexp = /\.vercel\/output\/static\/?$/

export const parseVercelConfig = (
	logger: Logger,
	config: string,
): VercelConfig => {
	const parsed = JSON.parse(config)

	// TODO: Improve validation and error handling
	if (!('version' in parsed)) {
		throw new Error('Invalid Vercel config: missing "version" field')
	}
	if (parsed.version !== 3) {
		logger.warn(
			`Expected Vercel config version 3, but got version ${parsed.version}`,
		)
	}

	return parsed as VercelConfig
}

export const readVercelConfigFile = async (
	logger: Logger,
	path: string,
): Promise<VercelConfig> => {
	return parseVercelConfig(logger, await readFile(path, 'utf8'))
}

export const buildVercelConfig = (
	astroConfig: Partial<AstroConfig>,
	securityHeadersOptions: SecurityHeadersOptions,
	perPageSriHashes: PerPageHashesCollection,
): VercelConfig => {
	const indexSlashOffset =
		astroConfig.trailingSlash === 'never'
			? -11
			: astroConfig.trailingSlash === 'always'
				? -10
				: undefined

	const pagesToIterate: [string, PerPageHashes][] = []
	for (const [page, hashes] of perPageSriHashes.entries()) {
		if (
			indexSlashOffset !== undefined &&
			(page === 'index.html' || page.endsWith('/index.html'))
		) {
			pagesToIterate.push([page.slice(0, indexSlashOffset), hashes])
		}
		pagesToIterate.push([page, hashes])
	}
	pagesToIterate.sort()

	const routes: VercelRoute[] = []
	for (const [page, hashes] of pagesToIterate) {
		const headers: Record<string, string> = {}

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

			headers['content-security-policy'] = serialiseCspDirectives(directives)
		}

		if (Object.keys(headers).length > 0) {
			routes.push({ src: `/${page}`, headers })
		}
	}

	return { version: 3, routes }
}

export const mergeVercelConfig = (
	base: VercelConfig,
	patch: VercelConfig,
): VercelConfig => {
	return { ...base, routes: [...(base.routes ?? []), ...(patch.routes ?? [])] }
}

export const serializeVercelConfig = (config: VercelConfig): string => {
	return JSON.stringify(config, null, '\t')
}

export const patchVercelHeadersConfig = async (
	logger: Logger,
	distDir: string,
	astroConfig: Partial<AstroConfig>,
	securityHeadersOptions: SecurityHeadersOptions,
	perPageSriHashes: PerPageHashesCollection,
): Promise<void> => {
	if (!vercelAdapterDistRegexp.test(distDir)) {
		logger.warn(
			'"@astrojs/vercel/static" adapter not detected, but "securityHeaders.enableOnStaticPages.provider" is set to "vercel". See https://docs.astro.build/en/guides/integrations-guide/vercel/#choosing-a-target to learn how to set up the adapter.',
		)
		return
	}
	const configPath = resolve(distDir, '..', 'config.json')
	if (!(await doesFileExist(configPath))) {
		logger.error(
			`Vercel adapter detected, but "config.json" not found in "${configPath}".`,
		)
		logger.error(JSON.stringify(await readdir(resolve(distDir))))
		logger.error(JSON.stringify(await readdir(resolve(distDir, '..'))))
		return
	}

	const baseConfig = await readVercelConfigFile(logger, configPath)

	const patchConfig = buildVercelConfig(
		astroConfig,
		securityHeadersOptions,
		perPageSriHashes,
	)

	const mergedConfig = mergeVercelConfig(baseConfig, patchConfig)

	await writeFile(configPath, serializeVercelConfig(mergedConfig))
}
