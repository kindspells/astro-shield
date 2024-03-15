/*
 * SPDX-FileCopyrightText: 2024 KindSpells Labs S.L.
 *
 * SPDX-License-Identifier: MIT
 */

import { resolve } from 'node:path'
import { readdir, rm } from 'node:fs/promises'

import { beforeEach, describe, expect, it } from 'vitest'
import {
	arraysEqual,
	generateSRIHash,
	generateSRIHashesModule,
	pageHashesEqual,
	scanForNestedResources,
	sriHashesEqual,
	updateDynamicPageSriHashes,
	updateStaticPageSriHashes,
} from '../src/core.mjs'
import { doesFileExist } from '../src/fs.mjs'

type SriHashes = {
	scripts: Record<string, string>
	styles: Record<string, string>
}

type PageHashesCollection = Record<
	string,
	{
		scripts: string[]
		styles: string[]
	}
>

const testsDir = new URL('.', import.meta.url).pathname
const fixturesDir = resolve(testsDir, 'fixtures')
const rootDir = resolve(testsDir, '..')
const srcDir = resolve(rootDir, 'src')

const getEmptyHashes = () => ({
	inlineScriptHashes: new Set<string>(),
	inlineStyleHashes: new Set<string>(),
	extScriptHashes: new Set<string>(),
	extStyleHashes: new Set<string>(),
	perPageSriHashes: new Map<
		string,
		{ scripts: Set<string>; styles: Set<string> }
	>(),
	perResourceSriHashes: {
		scripts: new Map<string, string>(),
		styles: new Map<string, string>(),
	},
})

describe('arraysEqual', () => {
	it.each([
		[[], []],
		[
			[1, 2, 3],
			[1, 2, 3],
		],
	])('returns true for equal arrays', (arr1: unknown[], arr2: unknown[]) => {
		expect(arr1).toEqual(arr2)
		expect(arraysEqual(arr1, arr2)).toBe(true)
	})

	it.each([
		[
			[1, 2, 3],
			[3, 2, 1],
		],
		[
			[1, 2, 3],
			[1, 2, 3, 4],
		],
		[
			[1, 2, 3],
			[1, 2],
		],
	])(
		'returns false for non-equal arrays',
		(arr1: unknown[], arr2: unknown[]) => {
			expect(arr1).not.toEqual(arr2)
			expect(arraysEqual(arr1, arr2)).toBe(false)
		},
	)
})

describe('pageHashesEqual', () => {
	it.each([
		[{}, {}],
		[
			{ 'index.html': { scripts: [], styles: [] } },
			{ 'index.html': { scripts: [], styles: [] } },
		],
		[
			{ 'index.html': { scripts: ['abcdefg'], styles: [] } },
			{ 'index.html': { scripts: ['abcdefg'], styles: [] } },
		],
		[
			{
				'index.html': { scripts: ['abcdefg'], styles: [] },
				'about.html': { scripts: [], styles: ['xyz'] },
			},
			{
				'index.html': { scripts: ['abcdefg'], styles: [] },
				'about.html': { scripts: [], styles: ['xyz'] },
			},
		],
	])(
		'returns true for equal hash collections',
		(a: PageHashesCollection, b: PageHashesCollection) => {
			expect(pageHashesEqual(a, b)).toBe(true)
		},
	)

	it.each([
		[{}, { 'index.html': { scripts: [], styles: [] } }],
		[
			{ 'index.html': { scripts: [], styles: [] } },
			{ 'index.html': { scripts: ['abcdefg'], styles: [] } },
		],
		[
			{ 'index.html': { scripts: ['abcdefg'], styles: [] } },
			{
				'index.html': { scripts: ['abcdefg'], styles: [] },
				'about.html': { scripts: [], styles: ['xyz'] },
			},
		],
		[
			{
				'index.html': { scripts: ['abcdefg'], styles: [] },
				'about.html': { scripts: [], styles: ['xyz'] },
			},
			{ 'index.html': { scripts: ['abcdefg'], styles: [] } },
		],
	])(
		'returns false for non-equal hash collections',
		(a: PageHashesCollection, b: PageHashesCollection) => {
			expect(pageHashesEqual(a, b)).toBe(false)
		},
	)
})

describe('sriHashesEqual', () => {
	it.each([
		[
			{ scripts: {}, styles: {} },
			{ scripts: {}, styles: {} },
		],
		[
			{ scripts: { a: 'hash-1' }, styles: {} },
			{ scripts: { a: 'hash-1' }, styles: {} },
		],
		[
			{ scripts: {}, styles: { b: 'hash-2' } },
			{ scripts: {}, styles: { b: 'hash-2' } },
		],
		[
			{ scripts: { a: 'hash-1' }, styles: { b: 'hash-2' } },
			{ scripts: { a: 'hash-1' }, styles: { b: 'hash-2' } },
		],
	])('returns true for equal hashes', (a: SriHashes, b: SriHashes) => {
		expect(sriHashesEqual(a, b)).toBe(true)
	})

	it.each([
		[
			{ scripts: {}, styles: {} },
			{ scripts: { a: 'hash-1' }, styles: {} },
		],
		[
			{ scripts: {}, styles: {} },
			{ scripts: {}, styles: { b: 'hash-2' } },
		],
		[
			{ scripts: {}, styles: {} },
			{ scripts: { a: 'hash-1' }, styles: { b: 'hash-2' } },
		],
		[
			{ scripts: { a: 'hash-1' }, styles: {} },
			{ scripts: {}, styles: { b: 'hash-2' } },
		],
		[
			{ scripts: { a: 'hash-1' }, styles: {} },
			{ scripts: { a: 'hash-1' }, styles: { b: 'hash-2' } },
		],
	])('returns false for non-equal hashes', (a: SriHashes, b: SriHashes) => {
		expect(sriHashesEqual(a, b)).toBe(false)
	})
})

describe('generateSRIHash', () => {
	const cases = [
		[
			'console.log("Hello World!")',
			'sha256-TWupyvVdPa1DyFqLnQMqRpuUWdS3nKPnz70IcS/1o3Q=',
		],
		['', 'sha256-47DEQpj8HBSa+/TImW+5JCeuQeRkm5NMpJWZG3hSuFU='],
	]

	it.each(cases)(
		'generates correct hash for utf8 strings',
		(content: string, hash: string) => {
			expect(generateSRIHash(content)).toEqual(hash)
		},
	)

	it.each(cases.map(([v, h]) => [Buffer.from(v, 'utf8'), h]))(
		'generates correct hash for Buffer objects',
		(content: Buffer, hash: string) => {
			expect(generateSRIHash(content)).toEqual(hash)
		},
	)

	it.each(cases.map(([v, h]) => [new TextEncoder().encode(v), h]))(
		'generates correct hash for ArrayBuffer objects',
		(content: ArrayBuffer, hash: string) => {
			expect(generateSRIHash(content)).toEqual(hash)
		},
	)
})

describe('updateStaticPageSriHashes', () => {
	it('adds sri hash to inline script', async () => {
		const content = `<html>
			<head>
				<title>My Test Page</title>
			</head>
			<body>
				<script>console.log("Hello World!")</script>
			</body>
		</html>`

		const expected = `<html>
			<head>
				<title>My Test Page</title>
			</head>
			<body>
				<script integrity="sha256-TWupyvVdPa1DyFqLnQMqRpuUWdS3nKPnz70IcS/1o3Q=">console.log("Hello World!")</script>
			</body>
		</html>`

		const h = getEmptyHashes()
		const updated = await updateStaticPageSriHashes(
			console,
			testsDir,
			'index.html',
			content,
			h,
		)

		expect(updated).toEqual(expected)
		expect(h.inlineScriptHashes.size).toBe(1)
		expect(
			h.inlineScriptHashes.has(
				'sha256-TWupyvVdPa1DyFqLnQMqRpuUWdS3nKPnz70IcS/1o3Q=',
			),
		).toBe(true)
		expect(h.inlineStyleHashes.size).toBe(0)
		expect(h.extScriptHashes.size).toBe(0)
		expect(h.extStyleHashes.size).toBe(0)
	})

	it('preserves sri hash in inline script', async () => {
		const content = `<html>
			<head>
				<title>My Test Page</title>
			</head>
			<body>
				<script integrity="sha256-TWupyvVdPa1DyFqLnQMqRpuUWdS3nKPnz70IcS/1o3Q=">console.log("Hello World!")</script>
			</body>
		</html>`

		const expected = `<html>
			<head>
				<title>My Test Page</title>
			</head>
			<body>
				<script integrity="sha256-TWupyvVdPa1DyFqLnQMqRpuUWdS3nKPnz70IcS/1o3Q=">console.log("Hello World!")</script>
			</body>
		</html>`

		const h = getEmptyHashes()
		const updated = await updateStaticPageSriHashes(
			console,
			testsDir,
			'index.html',
			content,
			h,
		)

		expect(updated).toEqual(expected)
		expect(h.inlineScriptHashes.size).toBe(1)
		expect(
			h.inlineScriptHashes.has(
				'sha256-TWupyvVdPa1DyFqLnQMqRpuUWdS3nKPnz70IcS/1o3Q=',
			),
		).toBe(true)
		expect(h.inlineStyleHashes.size).toBe(0)
		expect(h.extScriptHashes.size).toBe(0)
		expect(h.extStyleHashes.size).toBe(0)
	})

	it('adds sri hash to inline style', async () => {
		const content = `<html>
			<head>
				<title>My Test Page</title>
				<style>h1 { color: red; }</style>
			</head>
			<body>
				<h1>My Test Page</h1>
				<p>Some text</p>
			</body>
		</html>`

		const expected = `<html>
			<head>
				<title>My Test Page</title>
				<style integrity="sha256-VATw/GI1Duwve1FGJ+z3c4gwulpBbeoGo1DqO20SdxM=">h1 { color: red; }</style>
			</head>
			<body>
				<h1>My Test Page</h1>
				<p>Some text</p>
			</body>
		</html>`

		const h = getEmptyHashes()
		const updated = await updateStaticPageSriHashes(
			console,
			testsDir,
			'index.html',
			content,
			h,
		)

		expect(updated).toEqual(expected)
		expect(h.inlineStyleHashes.size).toBe(1)
		expect(
			h.inlineStyleHashes.has(
				'sha256-VATw/GI1Duwve1FGJ+z3c4gwulpBbeoGo1DqO20SdxM=',
			),
		).toBe(true)
		expect(h.inlineScriptHashes.size).toBe(0)
		expect(h.extScriptHashes.size).toBe(0)
		expect(h.extStyleHashes.size).toBe(0)
	})

	it('adds sri hash to external script (same origin)', async () => {
		const content = `<html>
			<head>
				<title>My Test Page</title>
			</head>
			<body>
				<script type="module" src="/core.mjs"></script>
			</body>
		</html>`

		const expected = `<html>
			<head>
				<title>My Test Page</title>
			</head>
			<body>
				<script type="module" src="/core.mjs" integrity="sha256-etOR/kKV9aCSESe7t5JeBixVQA1DjUU2Zxk13wsPU8M="></script>
			</body>
		</html>`

		const h = getEmptyHashes()
		const updated = await updateStaticPageSriHashes(
			console,
			srcDir,
			'index.html',
			content,
			h,
		)

		expect(updated).toEqual(expected)
		expect(h.extScriptHashes.size).toBe(1)
		expect(
			h.extScriptHashes.has(
				'sha256-etOR/kKV9aCSESe7t5JeBixVQA1DjUU2Zxk13wsPU8M=',
			),
		).toBe(true)
		expect(h.inlineScriptHashes.size).toBe(0)
		expect(h.inlineStyleHashes.size).toBe(0)
		expect(h.extStyleHashes.size).toBe(0)
	})

	it('adds sri hash to external script (cross origin)', async () => {
		const remoteScript =
			'https://raw.githubusercontent.com/KindSpells/astro-shield/ae9521048f2129f633c075b7f7ef24e11bbd1884/main.mjs'
		const content = `<html>
			<head>
				<title>My Test Page</title>
			</head>
			<body>
				<script type="module" src="${remoteScript}"></script>
			</body>
		</html>`

		const expected = `<html>
			<head>
				<title>My Test Page</title>
			</head>
			<body>
				<script type="module" src="${remoteScript}" integrity="sha256-i4WR4ifasidZIuS67Rr6Knsy7/hK1xbVTc8ZAmnAv1Q=" crossorigin="anonymous"></script>
			</body>
		</html>`

		const h = getEmptyHashes()
		const updated = await updateStaticPageSriHashes(
			console,
			rootDir,
			'index.html',
			content,
			h,
		)

		expect(updated).toEqual(expected)
		expect(h.extScriptHashes.size).toBe(1)
		expect(
			h.extScriptHashes.has(
				'sha256-i4WR4ifasidZIuS67Rr6Knsy7/hK1xbVTc8ZAmnAv1Q=',
			),
		).toBe(true)
		expect(h.inlineScriptHashes.size).toBe(0)
		expect(h.inlineStyleHashes.size).toBe(0)
		expect(h.extStyleHashes.size).toBe(0)
	})

	it('adds sri hash to external style (same origin)', async () => {
		const content = `<html>
			<head>
				<title>My Test Page</title>
				<link rel="canonical" href="https://example.com" />
				<link rel="stylesheet" href="/fixtures/fake.css">
			</head>
			<body>
				<h1>My Test Page</h1>
				<p>Some text</p>
			</body>
		</html>`

		const expected = `<html>
			<head>
				<title>My Test Page</title>
				<link rel="canonical" href="https://example.com" />
				<link rel="stylesheet" href="/fixtures/fake.css" integrity="sha256-gl5rCtPAw9BpVpGpdLhrf4LFwVUQ0FgQ5D231KxY2/w="/>
			</head>
			<body>
				<h1>My Test Page</h1>
				<p>Some text</p>
			</body>
		</html>`

		const h = getEmptyHashes()
		const updated = await updateStaticPageSriHashes(
			console,
			testsDir,
			'index.html',
			content,
			h,
		)

		expect(updated).toEqual(expected)
		expect(h.extStyleHashes.size).toBe(1)
		expect(
			h.extStyleHashes.has(
				'sha256-gl5rCtPAw9BpVpGpdLhrf4LFwVUQ0FgQ5D231KxY2/w=',
			),
		).toBe(true)
		expect(h.inlineScriptHashes.size).toBe(0)
		expect(h.extScriptHashes.size).toBe(0)
		expect(h.inlineStyleHashes.size).toBe(0)
	})

	// TODO: Add tests for external styles
})

describe('updateDynamicPageSriHashes', () => {
	const getMiddlewareHashes = () => {
		return {
			scripts: new Map<string, string>(),
			styles: new Map<string, string>(),
		}
	}

	it('adds sri hash to inline script', async () => {
		const content = `<html>
			<head>
				<title>My Test Page</title>
			</head>
			<body>
				<script>console.log("Hello World!")</script>
			</body>
		</html>`

		const expected = `<html>
			<head>
				<title>My Test Page</title>
			</head>
			<body>
				<script integrity="sha256-TWupyvVdPa1DyFqLnQMqRpuUWdS3nKPnz70IcS/1o3Q=">console.log("Hello World!")</script>
			</body>
		</html>`

		const h = getMiddlewareHashes()
		const { pageHashes, updatedContent } = await updateDynamicPageSriHashes(
			console,
			content,
			h,
		)

		expect(updatedContent).toEqual(expected)
		expect(h.scripts.size).toBe(0)
		expect(h.styles.size).toBe(0)

		expect(pageHashes.scripts.size).toBe(1)
		expect(pageHashes.styles.size).toBe(0)
		expect(
			pageHashes.scripts.has(
				'sha256-TWupyvVdPa1DyFqLnQMqRpuUWdS3nKPnz70IcS/1o3Q=',
			),
		)
	})

	it('preserves sri hash in inline script', async () => {
		const content = `<html>
			<head>
				<title>My Test Page</title>
			</head>
			<body>
				<script integrity="sha256-TWupyvVdPa1DyFqLnQMqRpuUWdS3nKPnz70IcS/1o3Q=">console.log("Hello World!")</script>
			</body>
		</html>`

		const expected = `<html>
			<head>
				<title>My Test Page</title>
			</head>
			<body>
				<script integrity="sha256-TWupyvVdPa1DyFqLnQMqRpuUWdS3nKPnz70IcS/1o3Q=">console.log("Hello World!")</script>
			</body>
		</html>`

		const h = getMiddlewareHashes()
		const { pageHashes, updatedContent } = await updateDynamicPageSriHashes(
			console,
			content,
			h,
		)

		expect(updatedContent).toEqual(expected)
		expect(h.scripts.size).toBe(0)
		expect(h.styles.size).toBe(0)

		expect(pageHashes.scripts.size).toBe(1)
		expect(pageHashes.styles.size).toBe(0)
		expect(
			pageHashes.scripts.has(
				'sha256-TWupyvVdPa1DyFqLnQMqRpuUWdS3nKPnz70IcS/1o3Q=',
			),
		)
	})

	it('adds sri hash to inline style', async () => {
		const content = `<html>
			<head>
				<title>My Test Page</title>
				<style>h1 { color: red; }</style>
			</head>
			<body>
				<h1>My Test Page</h1>
				<p>Some text</p>
			</body>
		</html>`

		const expected = `<html>
			<head>
				<title>My Test Page</title>
				<style integrity="sha256-VATw/GI1Duwve1FGJ+z3c4gwulpBbeoGo1DqO20SdxM=">h1 { color: red; }</style>
			</head>
			<body>
				<h1>My Test Page</h1>
				<p>Some text</p>
			</body>
		</html>`

		const h = getMiddlewareHashes()
		const { pageHashes, updatedContent } = await updateDynamicPageSriHashes(
			console,
			content,
			h,
		)

		expect(updatedContent).toEqual(expected)
		expect(pageHashes.styles.size).toBe(1)
		expect(
			pageHashes.styles.has(
				'sha256-VATw/GI1Duwve1FGJ+z3c4gwulpBbeoGo1DqO20SdxM=',
			),
		).toBe(true)
		expect(pageHashes.scripts.size).toBe(0)
		expect(h.scripts.size).toBe(0)
		expect(h.styles.size).toBe(0)
	})

	it('adds sri hash to external script (same origin)', async () => {
		const content = `<html>
			<head>
				<title>My Test Page</title>
			</head>
			<body>
				<script type="module" src="/core.mjs"></script>
			</body>
		</html>`

		const expected = `<html>
			<head>
				<title>My Test Page</title>
			</head>
			<body>
				<script type="module" src="/core.mjs" integrity="sha256-6vcZ3jYR5LROXY5VlgX+tgNuIUVynHfMRQFXUnXSf64="></script>
			</body>
		</html>`

		// "pre-loaded"
		const h = getMiddlewareHashes()
		h.scripts.set(
			'/core.mjs',
			'sha256-6vcZ3jYR5LROXY5VlgX+tgNuIUVynHfMRQFXUnXSf64=',
		)

		const { pageHashes, updatedContent } = await updateDynamicPageSriHashes(
			console,
			content,
			h,
		)

		expect(updatedContent).toEqual(expected)

		// "no changes"
		expect(h.scripts.size).toBe(1)
		expect(h.scripts.get('/core.mjs')).toEqual(
			'sha256-6vcZ3jYR5LROXY5VlgX+tgNuIUVynHfMRQFXUnXSf64=',
		)

		expect(h.styles.size).toBe(0)
		expect(pageHashes.scripts.size).toBe(1)
		expect(
			pageHashes.scripts.has(
				'sha256-6vcZ3jYR5LROXY5VlgX+tgNuIUVynHfMRQFXUnXSf64=',
			),
		).toBe(true)
		expect(pageHashes.styles.size).toBe(0)
	})

	it('adds sri hash to external script (cross origin)', async () => {
		const remoteScript =
			'https://raw.githubusercontent.com/KindSpells/astro-shield/ae9521048f2129f633c075b7f7ef24e11bbd1884/main.mjs'
		const content = `<html>
			<head>
				<title>My Test Page</title>
			</head>
			<body>
				<script type="module" src="${remoteScript}"></script>
			</body>
		</html>`

		const expected = `<html>
			<head>
				<title>My Test Page</title>
			</head>
			<body>
				<script type="module" src="${remoteScript}" integrity="sha256-i4WR4ifasidZIuS67Rr6Knsy7/hK1xbVTc8ZAmnAv1Q=" crossorigin="anonymous"></script>
			</body>
		</html>`

		const h = getMiddlewareHashes()
		const { pageHashes, updatedContent } = await updateDynamicPageSriHashes(
			console,
			content,
			h,
		)

		expect(updatedContent).toEqual(expected)
		expect(h.scripts.size).toBe(1)
		expect(h.styles.size).toBe(0)
		expect(h.scripts.get(remoteScript)).toEqual(
			'sha256-i4WR4ifasidZIuS67Rr6Knsy7/hK1xbVTc8ZAmnAv1Q=',
		)
		expect(pageHashes.scripts.size).toBe(1)
		expect(
			pageHashes.scripts.has(
				'sha256-i4WR4ifasidZIuS67Rr6Knsy7/hK1xbVTc8ZAmnAv1Q=',
			),
		).toBe(true)
		expect(pageHashes.styles.size).toBe(0)
	})

	it('adds sri hash to external style (same origin)', async () => {
		const content = `<html>
			<head>
				<title>My Test Page</title>
				<link rel="canonical" href="https://example.com" />
				<link rel="stylesheet" href="/fixtures/fake.css">
			</head>
			<body>
				<h1>My Test Page</h1>
				<p>Some text</p>
			</body>
		</html>`

		const expected = `<html>
			<head>
				<title>My Test Page</title>
				<link rel="canonical" href="https://example.com" />
				<link rel="stylesheet" href="/fixtures/fake.css" integrity="sha256-gl5rCtPAw9BpVpGpdLhrf4LFwVUQ0FgQ5D231KxY2/w="/>
			</head>
			<body>
				<h1>My Test Page</h1>
				<p>Some text</p>
			</body>
		</html>`

		// "pre-loaded"
		const h = getMiddlewareHashes()
		h.styles.set(
			'/fixtures/fake.css',
			'sha256-gl5rCtPAw9BpVpGpdLhrf4LFwVUQ0FgQ5D231KxY2/w=',
		)

		const { pageHashes, updatedContent } = await updateDynamicPageSriHashes(
			console,
			content,
			h,
		)

		expect(updatedContent).toEqual(expected)
		expect(h.styles.size).toBe(1)
		expect(h.styles.get('/fixtures/fake.css')).toEqual(
			'sha256-gl5rCtPAw9BpVpGpdLhrf4LFwVUQ0FgQ5D231KxY2/w=',
		)
		expect(pageHashes.scripts.size).toBe(0)
		expect(h.scripts.size).toBe(0)
		expect(pageHashes.styles.size).toBe(1)
		expect(
			pageHashes.styles.has(
				'sha256-gl5rCtPAw9BpVpGpdLhrf4LFwVUQ0FgQ5D231KxY2/w=',
			),
		).toBe(true)
	})

	// TODO: Maybe some day we don't treat the next case as special
	it('leaves untouched "dev" resources', async () => {
		const content = `<html>
			<head>
				<title>My Test Page</title>
				<link rel="stylesheet" href="/index.astro?astro&type=css">
			</head>
			<body>
				<script src="/@vite/some-dev-script.js"></script>
				<script src="/@fs/another-dev-script.js"></script>
			</body>
		</html>`

		const expected = `<html>
			<head>
				<title>My Test Page</title>
				<link rel="stylesheet" href="/index.astro?astro&type=css">
			</head>
			<body>
				<script src="/@vite/some-dev-script.js"></script>
				<script src="/@fs/another-dev-script.js"></script>
			</body>
		</html>`

		let warnCalls = 0
		const testLogger = {
			info(msg: string) {
				return console.info(msg)
			},
			warn(msg: string) {
				warnCalls += 1
				return console.warn(msg)
			},
			error(msg: string) {
				return console.error(msg)
			},
		}

		const h = getMiddlewareHashes()
		const { updatedContent } = await updateDynamicPageSriHashes(
			testLogger,
			content,
			h,
		)

		expect(updatedContent).toEqual(expected)
		expect(warnCalls).toBe(0)
	})

	it('logs problems to get SRI hash for "local" resource', async () => {
		const content = `<html>
			<head>
				<title>My Test Page</title>
			</head>
			<body>
				<script src="/problematic/local/script.js"></script>
			</body>
		</html>`

		const expected = `<html>
			<head>
				<title>My Test Page</title>
			</head>
			<body>
				<script src="/problematic/local/script.js"></script>
			</body>
		</html>`

		let warnCalls = 0
		let lastWarnMsg = ''
		const testLogger = {
			info(msg: string) {
				return console.info(msg)
			},
			warn(msg: string) {
				warnCalls += 1
				lastWarnMsg = msg
				return console.warn(msg)
			},
			error(msg: string) {
				return console.error(msg)
			},
		}

		const h = getMiddlewareHashes()
		const { updatedContent } = await updateDynamicPageSriHashes(
			testLogger,
			content,
			h,
		)

		expect(updatedContent).toEqual(expected)
		expect(warnCalls).toEqual(1)
		expect(lastWarnMsg).toEqual(
			'Unable to obtain SRI hash for local resource: "/problematic/local/script.js"',
		)
	})
})

describe('scanForNestedResources', () => {
	it('populates our hashes collection with hashes from nested resources', async () => {
		const h = getEmptyHashes()
		await scanForNestedResources(console, fixturesDir, h)

		expect(Array.from(h.extScriptHashes).sort()).toEqual([
			'sha256-qltpXHhrYfCJ4kXfyK7x9wqFlMGSbesibKN3FVUpqMM=',
			'sha256-uDDQGUSAjWHe2xxeUlsnqjUEki6AUou31AAMIDDEc2g=',
		])
		expect(Array.from(h.extStyleHashes).sort()).toEqual([
			'sha256-gl5rCtPAw9BpVpGpdLhrf4LFwVUQ0FgQ5D231KxY2/w=',
		])
		expect(Array.from(h.perResourceSriHashes.scripts.keys()).sort()).toEqual([
			'/fake.js',
			'/nested/nested.js',
		])
		expect(Array.from(h.perResourceSriHashes.styles.keys()).sort()).toEqual([
			'/fake.css',
		])
	})
})

describe('generateSRIHashesModule', () => {
	const playgroundDir = resolve(testsDir, 'playground')

	beforeEach(async () => {
		for (const filename of await readdir(playgroundDir, { recursive: true})) {
			if (filename.endsWith('.mjs')) {
				await rm(resolve(playgroundDir, filename), {
					force: true,
				})
			}
		}
	})

	it('generates "empty" module when it does not exist and we pass empty hashes collection', async () => {
		const modulePath = resolve(playgroundDir, 'sri.mjs')

		expect(
			await doesFileExist(modulePath),
		).toBe(false)

		const h = getEmptyHashes()
		await generateSRIHashesModule(
			h,
			modulePath,
		)

		expect(
			await doesFileExist(modulePath),
		).toBe(true)

		const hashesModule = await import(modulePath)

		expect(hashesModule).toHaveProperty('inlineScriptHashes')
		expect(hashesModule).toHaveProperty('inlineStyleHashes')
		expect(hashesModule).toHaveProperty('extScriptHashes')
		expect(hashesModule).toHaveProperty('extStyleHashes')
		expect(hashesModule).toHaveProperty('perPageSriHashes')
		expect(hashesModule).toHaveProperty('perResourceSriHashes')
	})
})
