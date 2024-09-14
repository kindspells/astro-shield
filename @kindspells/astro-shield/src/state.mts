/*
 * SPDX-FileCopyrightText: 2024 KindSpells Labs S.L.
 *
 * SPDX-License-Identifier: MIT
 */

import type { MiddlewareHashes } from './types.mts'

let globalHashes: MiddlewareHashes

export const getGlobalHashes = (): MiddlewareHashes => {
	if (!globalHashes) {
		globalHashes = { scripts: new Map(), styles: new Map() }
	}

	return globalHashes
}
