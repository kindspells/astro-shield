/*
 * SPDX-FileCopyrightText: 2024 KindSpells Labs S.L.
 *
 * SPDX-License-Identifier: MIT
 */

import { readdir, stat } from 'node:fs/promises'
import { resolve } from 'node:path'

import type { HashesCollection, Logger, SRIOptions } from './types.mts'

/** @internal */
export const doesFileExist = async (path: string): Promise<boolean> => {
	try {
		await stat(path)
		return true
	} catch (err) {
		if ((err as undefined | { code: unknown })?.code === 'ENOENT') {
			return false
		}
		throw err
	}
}

/** @internal */
export const scanDirectory = async (
	logger: Logger,
	currentPath: string,
	rootPath: string,
	h: HashesCollection,
	processFile: (
		logger: Logger,
		filePath: string,
		distDir: string,
		h: HashesCollection,
		sri?: SRIOptions,
	) => Promise<void>,
	filenameCondition: (filename: string) => boolean,
	sri?: SRIOptions,
): Promise<void> => {
	for (const file of await readdir(currentPath)) {
		const filePath = resolve(currentPath, file)
		const stats = await stat(filePath)

		if (stats.isDirectory()) {
			await scanDirectory(
				logger,
				filePath,
				rootPath,
				h,
				processFile,
				filenameCondition,
				sri,
			)
		} else if (stats.isFile() && filenameCondition(file)) {
			await processFile(logger, filePath, rootPath, h, sri)
		}
	}
}
