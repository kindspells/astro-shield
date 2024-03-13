import { readFile } from 'node:fs/promises'
import { relative, resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

import type { HashesCollection } from '../src/core.mjs'
import { generateSRIHash } from '../src/core.mjs'
import { doesFileExist, scanDirectory } from '../src/fs.mjs'

const testsDir = new URL('.', import.meta.url).pathname

describe('doesFileExist', () => {
	it.each([['./core.test.mts'], ['../src/core.mjs'], ['../src/main.mjs']])(
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

describe('scanDirectory', () => {
	it('is able to scan directories recursively', async () => {
		const currentDir = resolve(testsDir, 'fixtures')

		const h: HashesCollection = {
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
		}

		await scanDirectory(
			console,
			currentDir,
			currentDir,
			h,
			async (_l, filepath, _dd, h) => {
				const content = await readFile(filepath)
				const hash = generateSRIHash(content)
				h.perResourceSriHashes.scripts.set(relative(currentDir, filepath), hash)
			},
			filename => filename.endsWith('.js'),
		)

		expect(Array.from(h.perResourceSriHashes.scripts.keys()).sort()).toEqual([
			'fake.js',
			'nested/nested.js',
		])
		expect(h.perResourceSriHashes.scripts.get('fake.js')).toEqual(
			'sha256-uDDQGUSAjWHe2xxeUlsnqjUEki6AUou31AAMIDDEc2g=',
		)
		expect(h.perResourceSriHashes.scripts.get('nested/nested.js')).toEqual(
			'sha256-qltpXHhrYfCJ4kXfyK7x9wqFlMGSbesibKN3FVUpqMM=',
		)
	})
})
