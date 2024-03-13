/*
 * SPDX-FileCopyrightText: 2024 KindSpells Labs S.L.
 *
 * SPDX-License-Identifier: MIT
 */

import { readdir, stat } from 'node:fs/promises'
import { resolve } from 'node:path'

/**
 * @typedef {import('./core.js').Logger} Logger
 * @typedef {import('./core.js').HashesCollection} HashesCollection
 */

/**
 * @param {string} path
 * @returns {Promise<boolean>}
 */
export const doesFileExist = async path => {
	try {
		await stat(path)
		return true
	} catch (err) {
		if (/** @type {{ code: unknown }} */ (err).code === 'ENOENT') {
			return false
		}
		throw err
	}
}

/**
 * @param {Logger} logger
 * @param {string} currentPath
 * @param {string} rootPath
 * @param {HashesCollection} h
 * @param {(logger: Logger, filePath: string, distDir: string, h: HashesCollection) => Promise<void>} processFile
 * @param {(filename: string) => boolean} filenameCondition
 */
export const scanDirectory = async (
	logger,
	currentPath,
	rootPath,
	h,
	processFile,
	filenameCondition,
) => {
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
			)
		} else if (stats.isFile() && filenameCondition(file)) {
			await processFile(logger, filePath, rootPath, h)
		}
	}
}
