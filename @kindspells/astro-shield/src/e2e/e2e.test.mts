/*
 * SPDX-FileCopyrightText: 2024 KindSpells Labs S.L.
 *
 * SPDX-License-Identifier: MIT
 */

import { execFile as _execFile } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'

import type { PreviewServer } from 'astro'
import { preview } from 'astro'
import {
	assert,
	afterAll,
	afterEach,
	beforeAll,
	beforeEach,
	describe,
	expect,
	it,
} from 'vitest'

import type { HashesModule } from '../core.mts'
import { generateSRIHash } from '../core.mts'
import { doesFileExist } from '../fs.mts'

const execFile = promisify(_execFile)

const currentDir = dirname(fileURLToPath(import.meta.url))
const fixturesDir = resolve(currentDir, 'fixtures')

const _checkHtmlIsPatched = async (
	content: string,
	baseUrl = 'http://localhost',
	expectExtStyle = false,
	extScripts: Record<string, string> = {},
) => {
	const integrityRegex =
		/\s+integrity\s*=\s*("(?<integrity1>.*?)"|'(?<integrity2>.*?)')/i
	const srcRegex = /\s+src\s*=\s*("(?<src1>.*?)"|'(?<src2>.*?)')/i
	const scriptRegex =
		/<script(?<attrs>(\s+[a-z][a-z0-9\-_]*(=('[^']*?'|"[^"]*?"))?)*?)\s*>(?<content>[\s\S]*?)<\/\s*script\s*>/gi
	const styleRegex =
		/<style(?<attrs>(\s+[a-z][a-z0-9\-_]*(=('[^']*?'|"[^"]*?"))?)*?)\s*>(?<content>[\s\S]*?)<\/\s*style\s*>/gi
	const linkRelRegex =
		/<link(?<attrs>(\s+[a-z][a-z0-9\-_]*(=('[^']*?'|"[^"]*?"))?)*?)\s*\/?>/gi
	const relStylesheetRegex = /\s+rel=("stylesheet"|'stylesheet')/i

	let match: RegExpExecArray | null

	// Checking for scripts
	// -------------------------------------------------------------------------
	let scriptMatches = 0
	// biome-ignore lint/suspicious/noAssignInExpressions: only for testing
	while ((match = scriptRegex.exec(content)) !== null) {
		const { attrs: scriptAttrs, content: scriptContent } = match.groups ?? {}
		assert(scriptAttrs !== undefined)

		const scriptIntegrityMatch = integrityRegex.exec(scriptAttrs)
		assert(scriptIntegrityMatch !== null)
		const scriptIntegrity =
			scriptIntegrityMatch.groups?.integrity1 ??
			scriptIntegrityMatch.groups?.integrity2
		assert(scriptIntegrity !== undefined)

		const scriptSrcMatch = srcRegex.exec(scriptAttrs)

		if (scriptSrcMatch === null) {
			assert(scriptContent !== undefined)
			expect(scriptIntegrity).toEqual(generateSRIHash(scriptContent))
		} else {
			assert(!scriptContent)
			const src = scriptSrcMatch.groups?.src1 ?? scriptSrcMatch.groups?.src2
			assert(src !== undefined && src.length > 0)
			expect(scriptIntegrity).toEqual(extScripts[src])
		}

		scriptMatches += 1
	}
	assert(scriptMatches > 0)

	// Checking for inline styles
	// -------------------------------------------------------------------------
	let styleMatches = 0
	// biome-ignore lint/suspicious/noAssignInExpressions: only for testing
	while ((match = styleRegex.exec(content)) !== null) {
		const { attrs: styleAttrs, content: styleContent } = match.groups ?? {}
		assert(styleAttrs !== undefined)
		assert(styleContent !== undefined)

		const styleIntegrityMatch = integrityRegex.exec(styleAttrs)
		assert(styleIntegrityMatch !== null)

		const styleIntegrity =
			styleIntegrityMatch.groups?.integrity1 ??
			styleIntegrityMatch.groups?.integrity2
		assert(styleIntegrity !== undefined)

		expect(styleIntegrity).toEqual(generateSRIHash(styleContent))

		styleMatches += 1
	}
	assert(styleMatches > 0)

	// Checking for external styles
	// -------------------------------------------------------------------------
	if (expectExtStyle) {
		let linkRelMatches = 0
		const hrefRegex = /\s+href\s*=\s*("(?<href1>.*?)"|'(?<href2>.*?)')/i

		// biome-ignore lint/suspicious/noAssignInExpressions: only for testing
		while ((match = linkRelRegex.exec(content)) !== null) {
			const { attrs } = match.groups ?? {}
			assert(attrs !== undefined)
			assert(relStylesheetRegex.exec(attrs) !== null)
			const hrefMatch = hrefRegex.exec(attrs)
			assert(hrefMatch !== null)
			const href = hrefMatch.groups?.href1 ?? hrefMatch.groups?.href2
			assert(href !== undefined && href.length > 0)

			const integrityMatch = integrityRegex.exec(attrs)
			assert(integrityMatch !== null)

			const integrity =
				integrityMatch.groups?.integrity1 ?? integrityMatch.groups?.integrity2
			assert(integrity !== undefined)

			const response = await fetch(href.startsWith('/') ? baseUrl + href : href)
			const content = await response.text()
			expect(integrity).toEqual(generateSRIHash(content))

			linkRelMatches += 1
		}
		assert(linkRelMatches > 0)
	} else {
		const linkMatch = linkRelRegex.exec(content)
		assert(linkMatch === null || relStylesheetRegex.exec(linkMatch[0]) === null)
	}
}

describe('static', () => {
	const projectDir = resolve(fixturesDir, 'static')
	const execOpts = { cwd: projectDir }

	beforeAll(async () => {
		await execFile('pnpm', ['install'], execOpts)
	})

	beforeEach(async () => {
		await execFile('pnpm', ['run', 'clean'], execOpts)
	})

	const checkHtmlIsPatched = async (filepath: string) => {
		const content = await readFile(filepath, 'utf8')
		return await _checkHtmlIsPatched(content)
	}

	const checkHtmlIsNotPatched = async (filepath: string) => {
		const content = await readFile(filepath, 'utf8')

		const integrityRegex =
			/\s+integrity\s*=\s*("(?<integrity1>.*?)"|'(?<integrity2>.*?)')/i
		const scriptRegex =
			/<script(?<attrs>(\s+[a-z][a-z0-9\-_]*(=('[^']*?'|"[^"]*?"))?)*?)\s*>(?<content>[\s\S]*?)<\/\s*script\s*>/gi
		const styleRegex =
			/<style(?<attrs>(\s+[a-z][a-z0-9\-_]*(=('[^']*?'|"[^"]*?"))?)*?)\s*>(?<content>[\s\S]*?)<\/\s*style\s*>/gi

		// Checking for inline scripts
		// -------------------------------------------------------------------------
		const scriptMatch = scriptRegex.exec(content)
		assert(scriptMatch !== null)

		const { attrs: scriptAttrs, content: scriptContent } =
			scriptMatch.groups ?? {}
		assert(scriptAttrs !== undefined)
		assert(scriptContent !== undefined)

		const scriptIntegrityMatch = integrityRegex.exec(scriptAttrs)
		assert(scriptIntegrityMatch === null)

		// Checking for inline styles
		// -------------------------------------------------------------------------
		const styleMatch = styleRegex.exec(content)
		assert(styleMatch !== null)

		const { attrs: styleAttrs, content: styleContent } = styleMatch.groups ?? {}
		assert(styleAttrs !== undefined)
		assert(styleContent !== undefined)

		const styleIntegrityMatch = integrityRegex.exec(styleAttrs)
		assert(styleIntegrityMatch === null)
	}

	it.each([[undefined], [true]])(
		'should generate a module exporting SRI hashes with "default + path" options',
		async (enableStaticSRI: boolean | undefined) => {
			await execFile('pnpm', ['run', 'build'], {
				...execOpts,
				...(enableStaticSRI
					? { env: { ...process.env, ENABLE_STATIC_SRI: 'true' } }
					: undefined),
			})

			await checkHtmlIsPatched(resolve(projectDir, 'dist', 'index.html'))

			const modulePath = resolve(projectDir, 'src', 'generated', 'sri.mjs')
			expect(await doesFileExist(modulePath)).toBe(true)
			const generatedModule = await import(modulePath)

			// Global Exports
			// -------------------------------------------------------------------------
			expect(generatedModule).toHaveProperty('inlineScriptHashes')
			expect(generatedModule).toHaveProperty('inlineStyleHashes')
			expect(generatedModule).toHaveProperty('extScriptHashes')
			expect(generatedModule).toHaveProperty('extStyleHashes')
			expect(generatedModule).toHaveProperty('perPageSriHashes')

			expect(Object.keys(generatedModule.perPageSriHashes).length).toEqual(1)
			expect(generatedModule.perPageSriHashes).toHaveProperty('index.html')

			// Global Hashes
			// -------------------------------------------------------------------------
			expect(generatedModule.inlineScriptHashes).toEqual([
				'sha256-YAk8ai9SByMV+33RYW8X9h1hAw/4tANFlFpU4Kt1jeI=',
			])
			expect(generatedModule.inlineStyleHashes).toEqual([
				'sha256-ZlgyI5Bx/aeAyk/wSIypqeIM5PBhz9IiAek9HIiAjaI=',
			])
			expect(generatedModule.extScriptHashes).toEqual([])
			expect(generatedModule.extStyleHashes).toEqual([])

			// Per-Page SRI Hashes
			// -------------------------------------------------------------------------
			const indexHashes = generatedModule.perPageSriHashes['index.html']

			expect(indexHashes).toHaveProperty('scripts')
			expect(indexHashes).toHaveProperty('styles')

			expect(indexHashes.scripts).toEqual([
				'sha256-YAk8ai9SByMV+33RYW8X9h1hAw/4tANFlFpU4Kt1jeI=',
			])
			expect(indexHashes.styles).toEqual([
				'sha256-ZlgyI5Bx/aeAyk/wSIypqeIM5PBhz9IiAek9HIiAjaI=',
			])
		},
	)

	it('should not generate a module with SRI hashes when we do not set the output module path', async () => {
		await execFile('pnpm', ['run', 'build'], {
			...execOpts,
			env: { ...process.env, ENABLE_SRI_MODULE: 'false' },
		})

		await checkHtmlIsPatched(resolve(projectDir, 'dist', 'index.html'))

		const modulePath = resolve(projectDir, 'src', 'generated', 'sri.mjs')
		expect(await doesFileExist(modulePath)).toBe(false)
	})

	it('should not process static files when we set enableStatic_SRI to false', async () => {
		await execFile('pnpm', ['run', 'build'], {
			...execOpts,
			env: { ...process.env, ENABLE_STATIC_SRI: 'false' },
		})

		await checkHtmlIsNotPatched(resolve(projectDir, 'dist', 'index.html'))

		const modulePath = resolve(projectDir, 'src', 'generated', 'sri.mjs')
		expect(await doesFileExist(modulePath)).toBe(false)
	})
})

describe('middleware', () => {
	const dynamicDir = resolve(fixturesDir, 'dynamic')
	const execOpts = { cwd: dynamicDir }

	let baseUrl: string
	let server: PreviewServer | undefined
	let port: number

	beforeAll(async () => {
		await execFile('pnpm', ['install'], execOpts)
		await execFile('pnpm', ['run', 'clean'], execOpts)
		await execFile('pnpm', ['run', 'build'], execOpts)
	})

	beforeEach(async () => {
		port = 9999 + Math.floor(Math.random() * 55536)
		baseUrl = `http://localhost:${port}`

		await cleanServer()
		server = await preview({
			root: dynamicDir,
			server: { port },
			logLevel: 'debug',
		})
	})

	const cleanServer = async () => {
		if (server) {
			if (!server.closed()) {
				await server.stop()
			}
			server = undefined
		}
	}

	afterEach(cleanServer)
	afterAll(cleanServer) // Just in case

	const checkHtmlIsPatched = async (path: string) => {
		const response = await fetch(baseUrl + path)
		const content = await response.text()
		return await _checkHtmlIsPatched(content)
	}

	it('patches inline resources for dynamically generated pages', async () => {
		await checkHtmlIsPatched('/')
	})

	it('does not send csp headers when the feature is disabled', async () => {
		const response = await fetch(`${baseUrl}/`)
		expect(response.headers.has('content-security-policy')).toBe(false)
	})
})

describe('middleware (hybrid)', () => {
	const hybridDir = resolve(fixturesDir, 'hybrid')
	const execOpts = { cwd: hybridDir }

	let baseUrl: string
	let server: PreviewServer | undefined
	let port: number

	beforeAll(async () => {
		await execFile('pnpm', ['install'], execOpts)
		await execFile('pnpm', ['run', 'clean'], execOpts)
		const { stdout: buildStdout } = await execFile(
			'pnpm',
			['run', 'build'],
			execOpts,
		)
		// TODO: Once we introduce more complex scripts, we might have to check
		//       again for the "run the build step again" message
		expect(buildStdout).not.toMatch(/run the build step again/)
	})

	beforeEach(async () => {
		port = 9999 + Math.floor(Math.random() * 55536)
		baseUrl = `http://localhost:${port}`

		await cleanServer()
		server = await preview({
			root: hybridDir,
			server: { port },
			logLevel: 'debug',
		})
	})

	const cleanServer = async () => {
		if (server) {
			if (!server.closed()) {
				await server.stop()
			}
			server = undefined
		}
	}

	afterEach(cleanServer)
	afterAll(cleanServer) // Just in case

	const checkHtmlIsPatched = async (
		path: string,
		extResources: Record<string, string> = {},
	) => {
		const response = await fetch(baseUrl + path)
		const content = await response.text()
		return await _checkHtmlIsPatched(content, baseUrl, false, extResources)
	}

	it('patches inline resources for dynamically generated pages referring static resources', async () => {
		await checkHtmlIsPatched('/', {
			'/code.js': 'sha256-X7QGGDHgf6XMoabXvV9pW7gl3ALyZhZlgKq1s3pwmME=',
		})

		await checkHtmlIsPatched('/static/', {
			'/code.js': 'sha256-X7QGGDHgf6XMoabXvV9pW7gl3ALyZhZlgKq1s3pwmME=',
		})
	})

	it('does not send csp headers when the feature is disabled', async () => {
		const response = await fetch(`${baseUrl}/`)
		expect(response.headers.has('content-security-policy')).toBe(false)
	})
})

describe('middleware (hybrid 2)', () => {
	const hybridDir = resolve(fixturesDir, 'hybrid2')
	const execOpts = { cwd: hybridDir }

	let baseUrl: string
	let server: PreviewServer | undefined
	let port: number

	beforeAll(async () => {
		await execFile('pnpm', ['install'], execOpts)
		await execFile('pnpm', ['run', 'clean'], execOpts)
		const { stdout: buildStdout } = await execFile(
			'pnpm',
			['run', 'build'],
			execOpts,
		)
		expect(buildStdout).toMatch(/run the build step again/)
		const { stdout: buildStdout2 } = await execFile(
			'pnpm',
			['run', 'build'],
			execOpts,
		)
		expect(buildStdout2).not.toMatch(/run the build step again/)
	})

	beforeEach(async () => {
		port = 9999 + Math.floor(Math.random() * 55536)
		baseUrl = `http://localhost:${port}`

		await cleanServer()
		server = await preview({
			root: hybridDir,
			server: { port },
			logLevel: 'debug',
		})
	})

	const cleanServer = async () => {
		if (server) {
			if (!server.closed()) {
				await server.stop()
			}
			server = undefined
		}
	}

	afterEach(cleanServer)
	afterAll(cleanServer) // Just in case

	const checkHtmlIsPatched = async (
		path: string,
		extResources: Record<string, string> = {},
	) => {
		const response = await fetch(baseUrl + path)
		const content = await response.text()
		return await _checkHtmlIsPatched(content, baseUrl, true, extResources)
	}

	it('patches inline resources for dynamically generated pages referring static resources', async () => {
		await checkHtmlIsPatched('/', {
			'/code.js': 'sha256-X7QGGDHgf6XMoabXvV9pW7gl3ALyZhZlgKq1s3pwmME=',
		})

		await checkHtmlIsPatched('/static/', {
			'/code.js': 'sha256-X7QGGDHgf6XMoabXvV9pW7gl3ALyZhZlgKq1s3pwmME=',
		})
	})

	it('does not send csp headers when the feature is disabled', async () => {
		const response = await fetch(`${baseUrl}/`)
		expect(response.headers.has('content-security-policy')).toBe(false)
	})
})

describe('middleware (hybrid 3)', () => {
	const hybridDir = resolve(fixturesDir, 'hybrid3')
	const execOpts = { cwd: hybridDir }

	let baseUrl: string
	let server: PreviewServer | undefined
	let port: number

	beforeAll(async () => {
		await execFile('pnpm', ['install'], execOpts)
		await execFile('pnpm', ['run', 'clean'], execOpts)
		const { stdout: buildStdout } = await execFile(
			'pnpm',
			['run', 'build'],
			execOpts,
		)
		expect(buildStdout).toMatch(/run the build step again/)
		const { stdout: buildStdout2 } = await execFile(
			'pnpm',
			['run', 'build'],
			execOpts,
		)
		expect(buildStdout2).not.toMatch(/run the build step again/)
	})

	beforeEach(async () => {
		port = 9999 + Math.floor(Math.random() * 55536)
		baseUrl = `http://localhost:${port}`

		await cleanServer()
		server = await preview({
			root: hybridDir,
			server: { port },
			logLevel: 'debug',
		})
	})

	const cleanServer = async () => {
		if (server) {
			if (!server.closed()) {
				await server.stop()
			}
			server = undefined
		}
	}

	afterEach(cleanServer)
	afterAll(cleanServer) // Just in case

	it('sends csp headers when the feature is enabled', async () => {
		const response = await fetch(`${baseUrl}/`)
		const cspHeader = response.headers.get('content-security-policy')

		assert(cspHeader !== null)
		assert(cspHeader)

		expect(cspHeader).toBe(
			"default-src 'none'; frame-ancestors 'none'; script-src 'self' 'sha256-X7QGGDHgf6XMoabXvV9pW7gl3ALyZhZlgKq1s3pwmME='; style-src 'self' 'sha256-9U7mv8FibD/D9IbGpXc86pz37l6/w4PCLpFIZuPrzh8=' 'sha256-ZlgyI5Bx/aeAyk/wSIypqeIM5PBhz9IiAek9HIiAjaI='",
		)
	})

	it('incorporates the allowed scripts into the generated hashes module', async () => {
		const hashesModulePath = resolve(hybridDir, 'src', 'generated', 'sri.mjs')
		assert(await doesFileExist(hashesModulePath))

		const hashesModule = (await import(hashesModulePath)) as HashesModule

		assert(
			Object.hasOwn(
				hashesModule.perResourceSriHashes.scripts,
				'https://code.jquery.com/jquery-3.7.1.slim.min.js',
			),
		)
		assert(
			Object.hasOwn(
				hashesModule.perResourceSriHashes.scripts,
				'https://code.jquery.com/ui/1.13.2/jquery-ui.min.js',
			),
		)
	})

	it('does not "validate" sri signatures for cross-origin scripts that are not in the allow list', async () => {
		const response = await fetch(`${baseUrl}/injected/`)
		const cspHeader = response.headers.get('content-security-policy')

		assert(cspHeader !== null)
		assert(cspHeader)

		const scriptDirective = cspHeader
			.split(/;\s*/)
			.filter(directive => directive.startsWith('script-src'))[0]
		assert(scriptDirective)

		// This hash belongs to an allowed script that included its integrity
		// attribute as well (https://code.jquery.com/jquery-3.7.1.slim.min.js).
		assert(
			scriptDirective.includes(
				'sha256-kmHvs0B+OpCW5GVHUNjv9rOmY0IvSIRcf7zGUDTDQM8=',
			),
		)

		// This hash belongs to an allowed script that did not include its
		// integrity attribute (https://code.jquery.com/ui/1.13.2/jquery-ui.min.js).
		assert(
			scriptDirective.includes(
				'sha256-lSjKY0/srUM9BE3dPm+c4fBo1dky2v27Gdjm2uoZaL0=',
			),
		)

		// The MOST IMPORTANT assertionf of this test:
		// This hash belongs to the script that is "injected" in the page
		// (more precisely, that is not in the allow list)
		assert(
			!scriptDirective.includes(
				'sha256-BbhdlvQf/xTY9gja0Dq3HiwQF8LaCRTXxZKRutelT44=',
			),
		)
	})
})
