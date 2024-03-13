/*
 * SPDX-FileCopyrightText: 2024 KindSpells Labs S.L.
 *
 * SPDX-License-Identifier: MIT
 */

/**
 * @typedef {import('./core.mjs').MiddlewareHashes} MiddlewareHashes
 */

/** @type {MiddlewareHashes} */
let globalHashes

/** @returns {MiddlewareHashes} */
export const getGlobalHashes = () => {
	if (!globalHashes) {
		globalHashes = {
			scripts: /** @type {Map<string, string>} */ (new Map()),
			styles: /** @type {Map<string, string>} */ (new Map()),
		}
	}
	return globalHashes
}
