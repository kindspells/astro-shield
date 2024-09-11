/*
 * SPDX-FileCopyrightText: 2024 KindSpells Labs S.L.
 *
 * SPDX-License-Identifier: MIT
 */

import { readdir, rm } from 'node:fs/promises'
import { resolve } from 'node:path'

import { assert, beforeEach, describe, expect, it } from 'vitest'
import {
	arraysEqual,
	generateSRIHash,
	generateSRIHashesModule,
	getCSPMiddlewareHandler,
	getMiddlewareHandler,
	getRegexProcessors,
	pageHashesEqual,
	scanAllowLists,
	scanForNestedResources,
	sriHashesEqual,
	updateDynamicPageSriHashes,
	updateStaticPageSriHashes,
} from '#as/core.mts'
import { doesFileExist } from '#as/fs.mts'

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
const rootDir = resolve(testsDir, '..', '..')
const distDir = resolve(rootDir, 'dist')

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

describe('getRegexProcessors', () => {
	const embedContentInSimpleHtml = (content: string) => `<html>
		<head>
			<title>My Test Page</title>
		</head>
		<body>
			${content}
		</body>
	</html>`

	describe('Script', () => {
		const config = getRegexProcessors().filter(p => p.t === 'Script')[0]
		assert(config)
		const regex = config.regex
		const srcRegex = config.srcRegex

		beforeEach(() => {
			regex.lastIndex = 0
		})

		it.each([
			[
				'<script>console.log("Hello World!")</script>',
				'console.log("Hello World!")',
			],
			[
				'<script >console.log("Hello World!")</ script >',
				'console.log("Hello World!")',
			],
		])('matches correct simple inline scripts', (scriptBlock, elemContent) => {
			const content = embedContentInSimpleHtml(scriptBlock)

			const match = regex.exec(content)
			assert(match)
			expect(match[0]).toEqual(scriptBlock)
			expect(match.groups?.content).toEqual(elemContent)
			expect(match.groups?.attrs).toBeFalsy()
			expect(match.groups?.closingTrick).toBeFalsy()

			expect(regex.exec(content)).toBeNull() // no more matches
		})

		it.each([
			['<script src="/fun.js"></script>', ' src="/fun.js"', '/fun.js'],
			['<script  src= "/fun.js" ></ script >', '  src= "/fun.js"', '/fun.js'],
			["<script src='/fun.js'></script>", " src='/fun.js'", '/fun.js'],
			['<script src=/fun.js></script>', ' src=/fun.js', '/fun.js'],
		])('matches simple external scripts', (scriptBlock, attrs, src) => {
			const content = embedContentInSimpleHtml(scriptBlock)

			const match = regex.exec(content)
			assert(match)
			expect(match[0]).toEqual(scriptBlock)
			expect(match.groups?.content).toBeFalsy()
			const mAttrs = match.groups?.attrs
			assert(mAttrs)
			expect(mAttrs).toEqual(attrs)
			expect(match.groups?.closingTrick).toBeFalsy()

			const srcMatch = srcRegex.exec(mAttrs)
			assert(srcMatch)

			const mSrc =
				srcMatch.groups?.src1 ?? srcMatch.groups?.src2 ?? srcMatch.groups?.src3
			assert(mSrc)
			expect(mSrc).toEqual(src)

			expect(regex.exec(content)).toBeNull() // no more matches
		})

		it.each([
			[
				'<script integrity="sha256-TWupyvVdPa1DyFqLnQMqRpuUWdS3nKPnz70IcS/1o3Q=" >console.log("Hello World!")</script>',
				'console.log("Hello World!")',
				' integrity="sha256-TWupyvVdPa1DyFqLnQMqRpuUWdS3nKPnz70IcS/1o3Q="',
			],
			[
				'<script type="module" integrity="sha256-TWupyvVdPa1DyFqLnQMqRpuUWdS3nKPnz70IcS/1o3Q=" >console.log("Hello World!")</script>',
				'console.log("Hello World!")',
				' type="module" integrity="sha256-TWupyvVdPa1DyFqLnQMqRpuUWdS3nKPnz70IcS/1o3Q="',
			],
			[
				'<script type=module integrity="sha256-TWupyvVdPa1DyFqLnQMqRpuUWdS3nKPnz70IcS/1o3Q=" >console.log("Hello World!")</script>',
				'console.log("Hello World!")',
				' type=module integrity="sha256-TWupyvVdPa1DyFqLnQMqRpuUWdS3nKPnz70IcS/1o3Q="',
			],
			[
				'<script type ="module" integrity="sha256-TWupyvVdPa1DyFqLnQMqRpuUWdS3nKPnz70IcS/1o3Q=" >console.log("Hello World!")</script>',
				'console.log("Hello World!")',
				' type ="module" integrity="sha256-TWupyvVdPa1DyFqLnQMqRpuUWdS3nKPnz70IcS/1o3Q="',
			],
			[
				'<script type= "module" integrity="sha256-TWupyvVdPa1DyFqLnQMqRpuUWdS3nKPnz70IcS/1o3Q=" >console.log("Hello World!")</script>',
				'console.log("Hello World!")',
				' type= "module" integrity="sha256-TWupyvVdPa1DyFqLnQMqRpuUWdS3nKPnz70IcS/1o3Q="',
			],
			[
				'<script type = "module"   integrity="sha256-TWupyvVdPa1DyFqLnQMqRpuUWdS3nKPnz70IcS/1o3Q="   >console.log("Hello World!")</  script  >',
				'console.log("Hello World!")',
				' type = "module"   integrity="sha256-TWupyvVdPa1DyFqLnQMqRpuUWdS3nKPnz70IcS/1o3Q="',
			],
			[
				'<script data-arbitrary-marker data-another   type=module >console.log("Hello World!")</  script  >',
				'console.log("Hello World!")',
				' data-arbitrary-marker data-another   type=module',
			],
		])(
			'matches correct inline scripts with attributes',
			(scriptBlock, elemContent, attrs) => {
				const content = embedContentInSimpleHtml(scriptBlock)

				const match = regex.exec(content)
				assert(match)
				expect(match[0]).toEqual(scriptBlock)
				expect(match.groups?.content).toEqual(elemContent)
				expect(match.groups?.attrs).toEqual(attrs)
				expect(match.groups?.closingTrick).toBeFalsy()

				expect(regex.exec(content)).toBeNull() // no more matches
			},
		)

		it.each([
			[
				'<script integrity="sha256-TWupyvVdPa1DyFqLnQMqRpuUWdS3nKPnz70IcS/1o3Q=" >console.log("Hello World!")</script data-fake-attr >',
				'<script integrity="sha256-TWupyvVdPa1DyFqLnQMqRpuUWdS3nKPnz70IcS/1o3Q=" >console.log("Hello World!")</script data-fake-attr',
				'console.log("Hello World!")',
				' integrity="sha256-TWupyvVdPa1DyFqLnQMqRpuUWdS3nKPnz70IcS/1o3Q="',
			],
			[
				'<script integrity="sha256-TWupyvVdPa1DyFqLnQMqRpuUWdS3nKPnz70IcS/1o3Q=" >console.log("Hello World!")</script data-one data-two >',
				'<script integrity="sha256-TWupyvVdPa1DyFqLnQMqRpuUWdS3nKPnz70IcS/1o3Q=" >console.log("Hello World!")</script data-one',
				'console.log("Hello World!")',
				' integrity="sha256-TWupyvVdPa1DyFqLnQMqRpuUWdS3nKPnz70IcS/1o3Q="',
			],
			[
				'<script integrity="sha256-TWupyvVdPa1DyFqLnQMqRpuUWdS3nKPnz70IcS/1o3Q=" >console.log("Hello World!")</script data-clever=">" >',
				'<script integrity="sha256-TWupyvVdPa1DyFqLnQMqRpuUWdS3nKPnz70IcS/1o3Q=" >console.log("Hello World!")</script data-clever=">"',
				'console.log("Hello World!")',
				' integrity="sha256-TWupyvVdPa1DyFqLnQMqRpuUWdS3nKPnz70IcS/1o3Q="',
			],
		])(
			'matches malicious inline scripts trying to evade regex detection by using attrs on closing tag"',
			(scriptBlock, capture, elemContent, attrs) => {
				const content = embedContentInSimpleHtml(scriptBlock)

				const match = regex.exec(content)
				assert(match)
				expect(match[0]).toEqual(capture)
				expect(match.groups?.content).toEqual(elemContent)
				expect(match.groups?.attrs).toEqual(attrs)
				assert(match.groups?.closingTrick) // We don't really need to know what's in there

				expect(regex.exec(content)).toBeNull() // no more matches
			},
		)
	})

	describe('Style', () => {
		const config = getRegexProcessors().filter(p => p.t === 'Style')[0]
		assert(config)
		const regex = config.regex

		beforeEach(() => {
			regex.lastIndex = 0
		})

		it.each([
			['<style>h1 { color: red; }</style>', 'h1 { color: red; }'],
			['<style >h1 { color: red; }</ style >', 'h1 { color: red; }'],
		])('matches correct simple inline styles', (styleBlock, elemContent) => {
			const content = embedContentInSimpleHtml(styleBlock)

			const match = regex.exec(content)
			assert(match)
			expect(match[0]).toEqual(styleBlock)
			expect(match.groups?.content).toEqual(elemContent)
			expect(match.groups?.attrs).toBeFalsy()
			expect(match.groups?.closingTrick).toBeFalsy()

			expect(regex.exec(content)).toBeNull() // no more matches
		})

		it.each([
			[
				'<style integrity="sha256-some-fake-hash">h1 { color: red; }</style>',
				'h1 { color: red; }',
				' integrity="sha256-some-fake-hash"',
			],
			[
				'<style  integrity="sha256-some-fake-hash"   data-something="whatever" data-blah >h1 { color: red; }</ style >',
				'h1 { color: red; }',
				'  integrity="sha256-some-fake-hash"   data-something="whatever" data-blah',
			],
			[
				'<style  integrity=\'sha256-some-fake-hash\'   data-something="whatever" data-blah >h1 { color: red; }</ style >',
				'h1 { color: red; }',
				'  integrity=\'sha256-some-fake-hash\'   data-something="whatever" data-blah',
			],
		])(
			'matches correct inline styles with attributes',
			(styleBlock, elemContent, attrs) => {
				const content = embedContentInSimpleHtml(styleBlock)

				const match = regex.exec(content)
				assert(match)
				expect(match[0]).toEqual(styleBlock)
				expect(match.groups?.content).toEqual(elemContent)
				try {
					expect(match.groups?.attrs).toEqual(attrs)
				} catch (e) {
					console.log(`"${match.groups?.attrs}"`)
					console.log(`"${attrs}"`)
					throw e
				}
				expect(match.groups?.closingTrick).toBeFalsy()

				expect(regex.exec(content)).toBeNull() // no more matches
			},
		)

		it.each([
			[
				'<style integrity="sha256-some-fake-hash" >h1 { color: red; }</style data-fake-attr >',
				'<style integrity="sha256-some-fake-hash" >h1 { color: red; }</style data-fake-attr',
				'h1 { color: red; }',
				' integrity="sha256-some-fake-hash"',
			],
			[
				'<style integrity="sha256-some-fake-hash" >h1 { color: red; }</style data-one data-two >',
				'<style integrity="sha256-some-fake-hash" >h1 { color: red; }</style data-one',
				'h1 { color: red; }',
				' integrity="sha256-some-fake-hash"',
			],
			[
				'<style integrity="sha256-some-fake-hash" >h1 { color: red; }</style data-fake="value" >',
				'<style integrity="sha256-some-fake-hash" >h1 { color: red; }</style data-fake="value"',
				'h1 { color: red; }',
				' integrity="sha256-some-fake-hash"',
			],
		])(
			'matches malicious inline styles trying to evade regex detection by using attrs on closing tag"',
			(styleBlock, capture, elemContent, attrs) => {
				const content = embedContentInSimpleHtml(styleBlock)

				const match = regex.exec(content)
				assert(match)
				expect(match[0]).toEqual(capture)
				expect(match.groups?.content).toEqual(elemContent)
				expect(match.groups?.attrs).toEqual(attrs)
				assert(match.groups?.closingTrick) // We don't really need to know what's in there

				expect(regex.exec(content)).toBeNull() // no more matches
			},
		)
	})
})

describe('generateSRIHash', () => {
	const cases = [
		[
			'console.log("Hello World!")',
			'sha256-TWupyvVdPa1DyFqLnQMqRpuUWdS3nKPnz70IcS/1o3Q=',
		],
		['', 'sha256-47DEQpj8HBSa+/TImW+5JCeuQeRkm5NMpJWZG3hSuFU='],
	] as const

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
				<script type="module" src="/core.mjs" integrity="sha256-57NR9VGwX5U1svn4FZBRRffMg+4n3Fquhfcn6lEtk9Q="></script>
			</body>
		</html>`

		const h = getEmptyHashes()
		const updated = await updateStaticPageSriHashes(
			console,
			distDir,
			'index.html',
			content,
			h,
		)

		expect(updated).toEqual(expected)
		expect(h.extScriptHashes.size).toBe(1)

		expect(
			h.extScriptHashes.has(
				'sha256-57NR9VGwX5U1svn4FZBRRffMg+4n3Fquhfcn6lEtk9Q=',
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

	it('adds sri hash to external script without duplicating the crossorigin attribute (cross origin)', async () => {
		const remoteScript =
			'https://raw.githubusercontent.com/KindSpells/astro-shield/ae9521048f2129f633c075b7f7ef24e11bbd1884/main.mjs'
		const content = `<html>
			<head>
				<title>My Test Page</title>
			</head>
			<body>
				<script type="module" src="${remoteScript}" crossorigin="anonymous"></script>
			</body>
		</html>`

		const expected = `<html>
			<head>
				<title>My Test Page</title>
			</head>
			<body>
				<script type="module" src="${remoteScript}" crossorigin="anonymous" integrity="sha256-i4WR4ifasidZIuS67Rr6Knsy7/hK1xbVTc8ZAmnAv1Q="></script>
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
				<link rel="stylesheet" href="/fixtures/fake.css" integrity="sha256-a8DhsANlpipCfrn1UYtdKQaaeWgSyW4hBvqdxDOfoow="/>
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
				'sha256-a8DhsANlpipCfrn1UYtdKQaaeWgSyW4hBvqdxDOfoow=',
			),
		).toBe(true)
		expect(h.inlineScriptHashes.size).toBe(0)
		expect(h.extScriptHashes.size).toBe(0)
		expect(h.inlineStyleHashes.size).toBe(0)
	})
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

	it('removes external script when not explicitly allowed (cross origin)', async () => {
		const remoteScript =
			'https://raw.githubusercontent.com/KindSpells/astro-shield/ae9521048f2129f633c075b7f7ef24e11bbd1884/main.mjs'
		const content = `<html>
			<head>
				<title>My Test Page</title>
			</head>
			<body>
				<script type="module" src="${remoteScript}"></script><!-- This script will be removed -->
			</body>
		</html>`

		const expected = `<html>
			<head>
				<title>My Test Page</title>
			</head>
			<body>
				<!-- This script will be removed -->
			</body>
		</html>`

		const h = getMiddlewareHashes()
		let warnCounter = 0
		const { pageHashes, updatedContent } = await updateDynamicPageSriHashes(
			{
				info: () => {},
				warn: () => {
					warnCounter += 1
				},
				error: () => {},
			},
			content,
			h,
		)

		expect(warnCounter).toBe(1)
		expect(updatedContent).toEqual(expected)
		expect(h.scripts.size).toBe(0)
		expect(h.styles.size).toBe(0)
		expect(h.scripts.get(remoteScript)).toBeUndefined()
		expect(pageHashes.scripts.size).toBe(0)
		expect(
			pageHashes.scripts.has(
				'sha256-i4WR4ifasidZIuS67Rr6Knsy7/hK1xbVTc8ZAmnAv1Q=',
			),
		).toBe(false)
		expect(pageHashes.styles.size).toBe(0)
	})

	it('adds sri hash to external script when allow-listed (cross origin)', async () => {
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
		h.scripts.set(
			remoteScript,
			'sha256-i4WR4ifasidZIuS67Rr6Knsy7/hK1xbVTc8ZAmnAv1Q=',
		)
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

	it('adds sri hash to external script without duplicating the crossorigin attribute when allow-listed (cross origin)', async () => {
		const remoteScript =
			'https://raw.githubusercontent.com/KindSpells/astro-shield/ae9521048f2129f633c075b7f7ef24e11bbd1884/main.mjs'
		const content = `<html>
			<head>
				<title>My Test Page</title>
			</head>
			<body>
				<script type="module" src="${remoteScript}" crossorigin='anonymous'></script>
			</body>
		</html>`

		const expected = `<html>
			<head>
				<title>My Test Page</title>
			</head>
			<body>
				<script type="module" src="${remoteScript}" crossorigin='anonymous' integrity="sha256-i4WR4ifasidZIuS67Rr6Knsy7/hK1xbVTc8ZAmnAv1Q="></script>
			</body>
		</html>`

		const h = getMiddlewareHashes()
		h.scripts.set(
			remoteScript,
			'sha256-i4WR4ifasidZIuS67Rr6Knsy7/hK1xbVTc8ZAmnAv1Q=',
		)
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
				<link rel="stylesheet" href="/fixtures/fake.css" integrity="sha256-a8DhsANlpipCfrn1UYtdKQaaeWgSyW4hBvqdxDOfoow="/>
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
			'sha256-a8DhsANlpipCfrn1UYtdKQaaeWgSyW4hBvqdxDOfoow=',
		)

		const { pageHashes, updatedContent } = await updateDynamicPageSriHashes(
			console,
			content,
			h,
		)

		expect(updatedContent).toEqual(expected)
		expect(h.styles.size).toBe(1)
		expect(h.styles.get('/fixtures/fake.css')).toEqual(
			'sha256-a8DhsANlpipCfrn1UYtdKQaaeWgSyW4hBvqdxDOfoow=',
		)
		expect(pageHashes.scripts.size).toBe(0)
		expect(h.scripts.size).toBe(0)
		expect(pageHashes.styles.size).toBe(1)
		expect(
			pageHashes.styles.has(
				'sha256-a8DhsANlpipCfrn1UYtdKQaaeWgSyW4hBvqdxDOfoow=',
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
			info(_msg: string) {},
			warn(_msg: string) {
				warnCalls += 1
			},
			error(_msg: string) {},
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
			info(_msg: string) {},
			warn(msg: string) {
				warnCalls += 1
				lastWarnMsg = msg
			},
			error(_msg: string) {},
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

	it('removes scripts with both src and content', async () => {
		const content = `<html>
			<head>
				<title>My Test Page</title>
			</head>
			<body>
				<script type="module" src="/core.mjs">
					console.log("This should not be here")
				</script><!-- This script will be removed-->
			</body>
		</html>`

		const expected = `<html>
			<head>
				<title>My Test Page</title>
			</head>
			<body>
				<!-- This script will be removed-->
			</body>
		</html>`

		// "pre-loaded" (its value does not matter in this case)
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
		expect(pageHashes.scripts.size).toBe(0)
		expect(pageHashes.styles.size).toBe(0)
	})

	it('removes external scripts with integrity mismatch', async () => {
		// "pre-loaded" (its value will differ from the one in the content)
		const h = getMiddlewareHashes()
		h.scripts.set(
			'/core.mjs',
			'sha256-1111111111111111111111111111111111111111111=',
		)

		const content = `<html>
			<head>
				<title>My Test Page</title>
			</head>
			<body>
				<script type="module" src="/core.mjs" integrity="sha256-2222222222222222222222222222222222222222222="></script><!-- This script will be removed-->
			</body>
		</html>`

		const expected = `<html>
			<head>
				<title>My Test Page</title>
			</head>
			<body>
				<!-- This script will be removed-->
			</body>
		</html>`

		const { pageHashes, updatedContent } = await updateDynamicPageSriHashes(
			console,
			content,
			h,
		)

		expect(updatedContent).toEqual(expected)

		// "no changes"
		expect(h.scripts.size).toBe(1)
		expect(h.scripts.get('/core.mjs')).toEqual(
			'sha256-1111111111111111111111111111111111111111111=',
		)

		expect(h.styles.size).toBe(0)
		expect(pageHashes.scripts.size).toBe(0)
		expect(pageHashes.styles.size).toBe(0)
	})

	it('removes external (cross-origin) scripts with integrity attribute but not explicitly allowed', async () => {
		// No "pre-loaded" hashes
		const h = getMiddlewareHashes()

		const content = `<html>
			<head>
				<title>My Test Page</title>
			</head>
			<body>
				<script type="module" src="https://external.com/script.js" integrity="sha256-1111111111111111111111111111111111111111111="></script><!-- This script will be removed-->
			</body>
		</html>`

		const expected = `<html>
			<head>
				<title>My Test Page</title>
			</head>
			<body>
				<!-- This script will be removed-->
			</body>
		</html>`

		const { pageHashes, updatedContent } = await updateDynamicPageSriHashes(
			console,
			content,
			h,
			// We do not pass an allow-list
		)

		expect(updatedContent).toEqual(expected)

		// "no changes"
		expect(h.scripts.size).toBe(0)
		expect(h.styles.size).toBe(0)
		expect(pageHashes.scripts.size).toBe(0)
		expect(pageHashes.styles.size).toBe(0)
	})
})

describe('scanAllowLists', () => {
	it('populates hashes collection with hashes from allow-listed resources', async () => {
		const scriptUrl =
			'https://raw.githubusercontent.com/KindSpells/astro-shield/ae9521048f2129f633c075b7f7ef24e11bbd1884/main.mjs'
		const styleUrl =
			'https://raw.githubusercontent.com/KindSpells/astro-shield/26fdf5399d79baa3a8ea70ded526116b0bfc06ed/e2e/fixtures/hybrid2/src/styles/normalize.css'

		const h = getEmptyHashes()
		await scanAllowLists(
			{
				scriptsAllowListUrls: [scriptUrl],
				stylesAllowListUrls: [styleUrl],
			},
			h,
		)

		expect(h.extScriptHashes.size).toBe(1)
		expect(h.extStyleHashes.size).toBe(1)
		expect(h.perResourceSriHashes.scripts.get(scriptUrl)).toBe(
			'sha256-i4WR4ifasidZIuS67Rr6Knsy7/hK1xbVTc8ZAmnAv1Q=',
		)
		expect(h.perResourceSriHashes.styles.get(styleUrl)).toBe(
			'sha256-7o69ZgSUx++S5DC0Ek7X2CbY4GnxxUkwGZDdybWxSG8=',
		)
	})
})

describe('scanForNestedResources', () => {
	it('populates our hashes collection with hashes from nested resources', async () => {
		const h = getEmptyHashes()
		await scanForNestedResources(console, fixturesDir, h)

		expect(Array.from(h.extScriptHashes).sort()).toEqual([
			'sha256-Kr4BjT3RWkTAZwxpTtuWUtdtEV+9lXy7amiQ4EXlytQ=',
			'sha256-qm2QDzbth03mDFQDvyNyUc7Ctvb9qRIhKL03a5eetaY=',
		])
		expect(Array.from(h.extStyleHashes).sort()).toEqual([
			'sha256-a8DhsANlpipCfrn1UYtdKQaaeWgSyW4hBvqdxDOfoow=',
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
		if (!(await doesFileExist(playgroundDir))) {
			return
		}
		for (const filename of await readdir(playgroundDir, { recursive: true })) {
			if (filename.endsWith('.mjs')) {
				await rm(resolve(playgroundDir, filename), {
					force: true,
				})
			}
		}
	})

	it('generates "empty" module when it does not exist and we pass empty hashes collection', async () => {
		const modulePath = resolve(playgroundDir, 'sri.mjs')

		expect(await doesFileExist(modulePath)).toBe(false)

		const h = getEmptyHashes()
		await generateSRIHashesModule(console, h, modulePath, false)

		expect(await doesFileExist(modulePath)).toBe(true)

		const hashesModule = await import(modulePath)

		expect(hashesModule).toHaveProperty('inlineScriptHashes')
		expect(hashesModule).toHaveProperty('inlineStyleHashes')
		expect(hashesModule).toHaveProperty('extScriptHashes')
		expect(hashesModule).toHaveProperty('extStyleHashes')
		expect(hashesModule).toHaveProperty('perPageSriHashes')
		expect(hashesModule).toHaveProperty('perResourceSriHashes')
	})
})

describe('getMiddlewareHandler', () => {
	it('returns a working middleware handler', async () => {
		const hashes = {
			scripts: new Map<string, string>(),
			styles: new Map<string, string>(),
		}
		let warnCounter = 0
		const middleware = getMiddlewareHandler(
			{
				info: () => {},
				warn: () => {
					warnCounter += 1
				},
				error: () => {},
			},
			hashes,
			{
				enableStatic: true,
				enableMiddleware: true,
				hashesModule: undefined,
				allowInlineScripts: 'all',
				allowInlineStyles: 'all',
				scriptsAllowListUrls: [],
				stylesAllowListUrls: [],
			},
		)
		type MidParams = Parameters<typeof middleware>

		const patchedResponse = await middleware(
			undefined as unknown as MidParams[0],
			(async () => {
				return {
					text: async () => `
<html>
	<head>
		<title>My Test Page</title>
	</head>
	<body>
		<script>console.log("Hello World!")</script>
	</body>
</html>`,
					status: 200,
					statusText: 'OK',
					headers: new Headers(),
				}
			}) as MidParams[1],
		)

		expect(warnCounter).toBe(0)
		assert(patchedResponse instanceof Response)
		const responseText = await patchedResponse.text()
		expect(responseText).toBe(`
<html>
	<head>
		<title>My Test Page</title>
	</head>
	<body>
		<script integrity="sha256-TWupyvVdPa1DyFqLnQMqRpuUWdS3nKPnz70IcS/1o3Q=">console.log("Hello World!")</script>
	</body>
</html>`)
	})

	it('removes inline scripts when they are not allowed', async () => {
		const hashes = {
			scripts: new Map<string, string>(),
			styles: new Map<string, string>(),
		}

		let warnCounter = 0
		const middleware = getMiddlewareHandler(
			{
				info: () => {},
				warn: () => {
					warnCounter += 1
				},
				error: () => {},
			},
			hashes,
			{
				enableStatic: true,
				enableMiddleware: true,
				hashesModule: undefined,
				allowInlineScripts: 'static',
				allowInlineStyles: 'static',
				scriptsAllowListUrls: [],
				stylesAllowListUrls: [],
			},
		)
		type MidParams = Parameters<typeof middleware>

		const patchedResponse = await middleware(
			undefined as unknown as MidParams[0],
			(async () => {
				return {
					text: async () => `
<html>
	<head>
		<title>My Test Page</title>
	</head>
	<body>
		<script>console.log("Hello World!")</script><!-- The script will be removed -->
	</body>
</html>`,
					status: 200,
					statusText: 'OK',
					headers: new Headers(),
				}
			}) as MidParams[1],
		)

		expect(warnCounter).toBe(1)
		assert(patchedResponse instanceof Response)
		const responseText = await patchedResponse.text()
		expect(patchedResponse.headers.has('content-security-policy')).toBe(false)
		expect(responseText).toBe(`
<html>
	<head>
		<title>My Test Page</title>
	</head>
	<body>
		<!-- The script will be removed -->
	</body>
</html>`)
	})
})

describe('getCSPMiddlewareHandler', () => {
	it('returns a working middleware handler', async () => {
		const hashes = {
			scripts: new Map<string, string>(),
			styles: new Map<string, string>(),
		}
		let warnCounter = 0
		const middleware = getCSPMiddlewareHandler(
			{
				info: () => {},
				warn: () => {
					warnCounter += 1
				},
				error: () => {},
			},
			hashes,
			{
				contentSecurityPolicy: {},
			},
			{
				enableStatic: true,
				enableMiddleware: true,
				hashesModule: undefined,
				allowInlineScripts: 'all',
				allowInlineStyles: 'all',
				scriptsAllowListUrls: [],
				stylesAllowListUrls: [],
			},
		)
		type MidParams = Parameters<typeof middleware>

		const patchedResponse = await middleware(
			undefined as unknown as MidParams[0],
			(async () => {
				return {
					text: async () => `
<html>
	<head>
		<title>My Test Page</title>
	</head>
	<body>
		<script>console.log("Hello World!")</script>
	</body>
</html>`,
					status: 200,
					statusText: 'OK',
					headers: new Headers(),
				}
			}) as MidParams[1],
		)

		expect(warnCounter).toBe(0)
		assert(patchedResponse instanceof Response)
		expect(patchedResponse.headers.has('content-security-policy')).toBe(true)
		expect(patchedResponse.headers.get('content-security-policy')).toBe(
			`script-src 'self' 'sha256-TWupyvVdPa1DyFqLnQMqRpuUWdS3nKPnz70IcS/1o3Q='; style-src 'none'`,
		)
		const responseText = await patchedResponse.text()
		expect(responseText).toBe(`
<html>
	<head>
		<title>My Test Page</title>
	</head>
	<body>
		<script integrity="sha256-TWupyvVdPa1DyFqLnQMqRpuUWdS3nKPnz70IcS/1o3Q=">console.log("Hello World!")</script>
	</body>
</html>`)
	})

	it('removes inline scripts when they are not allowed', async () => {
		const hashes = {
			scripts: new Map<string, string>(),
			styles: new Map<string, string>(),
		}

		let warnCounter = 0
		const middleware = getCSPMiddlewareHandler(
			{
				info: () => {},
				warn: () => {
					warnCounter += 1
				},
				error: () => {},
			},
			hashes,
			{ contentSecurityPolicy: {} },
			{
				enableStatic: true,
				enableMiddleware: true,
				hashesModule: undefined,
				allowInlineScripts: 'static',
				allowInlineStyles: 'static',
				scriptsAllowListUrls: [],
				stylesAllowListUrls: [],
			},
		)
		type MidParams = Parameters<typeof middleware>

		const patchedResponse = await middleware(
			undefined as unknown as MidParams[0],
			(async () => {
				return {
					text: async () => `
<html>
	<head>
		<title>My Test Page</title>
	</head>
	<body>
		<script>console.log("Hello World!")</script><!-- The script will be removed -->
	</body>
</html>`,
					status: 200,
					statusText: 'OK',
					headers: new Headers(),
				}
			}) as MidParams[1],
		)

		expect(warnCounter).toBe(1)
		assert(patchedResponse instanceof Response)
		const responseText = await patchedResponse.text()
		expect(patchedResponse.headers.has('content-security-policy')).toBe(true)
		expect(responseText).toBe(`
<html>
	<head>
		<title>My Test Page</title>
	</head>
	<body>
		<!-- The script will be removed -->
	</body>
</html>`)
	})
})
