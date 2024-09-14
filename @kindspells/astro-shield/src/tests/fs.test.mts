/*
 * SPDX-FileCopyrightText: 2024 KindSpells Labs S.L.
 *
 * SPDX-License-Identifier: MIT
 */

import { readFile } from 'node:fs/promises'
import { relative, resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

import type { HashesCollection } from '../types.mts'
import { generateSRIHash } from '../core.mts'
import { doesFileExist, scanDirectory } from '../fs.mts'

const testsDir = new URL('.', import.meta.url).pathname

describe('doesFileExist', () => {
	it.each([['./core.test.mts'], ['../core.mts'], ['../main.mts']])(
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
			'sha256-qm2QDzbth03mDFQDvyNyUc7Ctvb9qRIhKL03a5eetaY=',
		)
		expect(h.perResourceSriHashes.scripts.get('nested/nested.js')).toEqual(
			'sha256-Kr4BjT3RWkTAZwxpTtuWUtdtEV+9lXy7amiQ4EXlytQ=',
		)
	})
})
