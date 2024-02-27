/*
 * SPDX-FileCopyrightText: 2024 KindSpells Labs S.L.
 *
 * SPDX-License-Identifier: MIT
 */

import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'
import {
	arraysEqual,
	doesFileExist,
	generateSRIHash,
	pageHashesEqual,
	updateSriHashes,
} from '../core.mjs'
import { AstroIntegrationLogger } from 'astro'

const testsDir = new URL('.', import.meta.url).pathname
const rootDir = resolve(testsDir, '..')

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

type PageHashesCollection = Record<
	string,
	{
		scripts: string[]
		styles: string[]
	}
>

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
	])(
		'returns false for non-equal hash collections',
		(a: PageHashesCollection, b: PageHashesCollection) => {
			expect(pageHashesEqual(a, b)).toBe(false)
		},
	)
})

describe('doesFileExist', () => {
	it.each([['./core.test.mts'], ['../core.mjs'], ['../main.mjs']])(
		'returns true for existing files',
		async (filename: string) => {
			expect(await doesFileExist(resolve(testsDir, filename))).toBe(true)
		},
	)

	it.each([['./magic.file'], ['../not.found'], ['../theAnswerToEverything']])(
		'returns false for non-existing files',
		async (filename: string) => {
			expect(await doesFileExist(resolve(testsDir, filename))).toBe(false)
		},
	)
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

describe('updateSriHashes', () => {
	const getEmptyHashes = () => ({
		inlineScriptHashes: new Set<string>(),
		inlineStyleHashes: new Set<string>(),
		extScriptHashes: new Set<string>(),
		extStyleHashes: new Set<string>(),
		perPageSriHashes: new Map<
			string,
			{ scripts: Set<string>; styles: Set<string> }
		>(),
	})

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
		const updated = await updateSriHashes(
			console as unknown as AstroIntegrationLogger,
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
		const updated = await updateSriHashes(
			console as unknown as AstroIntegrationLogger,
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
		const updated = await updateSriHashes(
			console as unknown as AstroIntegrationLogger,
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
				<script type="module" src="/core.mjs" integrity="sha256-kw3sUNwwIbNJd5X5nyEclIhbb9UoOHAC0ouWE6pUUKU="></script>
			</body>
		</html>`

		const h = getEmptyHashes()
		const updated = await updateSriHashes(
			console as unknown as AstroIntegrationLogger,
			rootDir,
			'index.html',
			content,
			h,
		)

		expect(updated).toEqual(expected)
		expect(h.extScriptHashes.size).toBe(1)
		expect(
			h.extScriptHashes.has(
				'sha256-kw3sUNwwIbNJd5X5nyEclIhbb9UoOHAC0ouWE6pUUKU=',
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
		const updated = await updateSriHashes(
			console as unknown as AstroIntegrationLogger,
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
				<link rel="stylesheet" href="/fake.css">
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
				<link rel="stylesheet" href="/fake.css" integrity="sha256-gl5rCtPAw9BpVpGpdLhrf4LFwVUQ0FgQ5D231KxY2/w="/>
			</head>
			<body>
				<h1>My Test Page</h1>
				<p>Some text</p>
			</body>
		</html>`

		const h = getEmptyHashes()
		const updated = await updateSriHashes(
			console as unknown as AstroIntegrationLogger,
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
