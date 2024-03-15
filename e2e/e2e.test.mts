import { readFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { execFile as _execFile } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'

import type { PreviewServer } from 'astro'
import { preview } from 'astro'
import {
	afterAll,
	afterEach,
	assert,
	beforeAll,
	beforeEach,
	describe,
	expect,
	it,
} from 'vitest'

import { generateSRIHash } from '../src/core.mjs'
import { doesFileExist } from '../src/fs.mjs'

const execFile = promisify(_execFile)

const currentDir = dirname(fileURLToPath(import.meta.url))
const fixturesDir = resolve(currentDir, 'fixtures')

const _checkHtmlIsPatched = (
	content: string,
	extResources: Record<string, string> = {},
) => {
	const integrityRegex =
		/\s+integrity\s*=\s*("(?<integrity1>.*?)"|'(?<integrity2>.*?)')/i
	const srcRegex = /\s+src\s*=\s*("(?<src1>.*?)"|'(?<src2>.*?)')/i
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
		expect(scriptIntegrity).toEqual(extResources[src])
	}

	// Checking for inline styles
	// -------------------------------------------------------------------------
	const styleMatch = styleRegex.exec(content)
	assert(styleMatch !== null)

	const { attrs: styleAttrs, content: styleContent } = styleMatch.groups ?? {}
	assert(styleAttrs !== undefined)
	assert(styleContent !== undefined)

	const styleIntegrityMatch = integrityRegex.exec(styleAttrs)
	assert(styleIntegrityMatch !== null)

	const styleIntegrity =
		styleIntegrityMatch.groups?.integrity1 ??
		styleIntegrityMatch.groups?.integrity2
	assert(styleIntegrity !== undefined)

	expect(styleIntegrity).toEqual(generateSRIHash(styleContent))
}

describe('static', () => {
	const staticDir = resolve(fixturesDir, 'static')
	const execOpts = { cwd: staticDir }

	beforeAll(async () => {
		await execFile('pnpm', ['install'], execOpts)
	})

	beforeEach(async () => {
		await execFile('pnpm', ['run', 'clean'], execOpts)
	})

	const checkHtmlIsPatched = async (filepath: string) => {
		const content = await readFile(filepath, 'utf8')
		return _checkHtmlIsPatched(content)
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

			await checkHtmlIsPatched(resolve(staticDir, 'dist', 'index.html'))

			const modulePath = resolve(staticDir, 'src', 'generated', 'sri.mjs')
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

		await checkHtmlIsPatched(resolve(staticDir, 'dist', 'index.html'))

		const modulePath = resolve(staticDir, 'src', 'generated', 'sri.mjs')
		expect(await doesFileExist(modulePath)).toBe(false)
	})

	it('should not process static files when we set enableStatic_SRI to false', async () => {
		await execFile('pnpm', ['run', 'build'], {
			...execOpts,
			env: { ...process.env, ENABLE_STATIC_SRI: 'false' },
		})

		await checkHtmlIsNotPatched(resolve(staticDir, 'dist', 'index.html'))

		const modulePath = resolve(staticDir, 'src', 'generated', 'sri.mjs')
		expect(await doesFileExist(modulePath)).toBe(false)
	})
})

describe('middleware', () => {
	const dynamicDir = resolve(fixturesDir, 'dynamic')
	const execOpts = { cwd: dynamicDir }

	let urlBase: string
	let server: PreviewServer | undefined
	let port: number

	beforeAll(async () => {
		await execFile('pnpm', ['install'], execOpts)
		await execFile('pnpm', ['run', 'clean'], execOpts)
		await execFile('pnpm', ['run', 'build'], execOpts)
	})

	beforeEach(async () => {
		port = 9999 + Math.floor(Math.random() * 55536)
		urlBase = `http://localhost:${port}`

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

	const checkHtmlIsPatched = async path => {
		const response = await fetch(urlBase + path)
		const content = await response.text()
		return _checkHtmlIsPatched(content)
	}

	it('patches inline resources for dynamically generated pages', async () => {
		await checkHtmlIsPatched('/')
	})
})

describe('middleware (hybrid)', () => {
	const hybridDir = resolve(fixturesDir, 'hybrid')
	const execOpts = { cwd: hybridDir }

	let urlBase: string
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
		urlBase = `http://localhost:${port}`

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
		const response = await fetch(urlBase + path)
		const content = await response.text()
		return _checkHtmlIsPatched(content, extResources)
	}

	it('patches inline resources for dynamically generated pages referring static resources', async () => {
		await checkHtmlIsPatched('/', {
			'/code.js': 'sha256-X7QGGDHgf6XMoabXvV9pW7gl3ALyZhZlgKq1s3pwmME=',
		})
	})
})
