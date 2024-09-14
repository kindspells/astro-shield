/*
 * SPDX-FileCopyrightText: 2024 KindSpells Labs S.L.
 *
 * SPDX-License-Identifier: MIT
 */

import { describe, expect, it } from 'vitest'

import { getGlobalHashes } from '../state.mts'

describe('getGlobalHashes', () => {
	it('returns a singleton', () => {
		const gh1 = getGlobalHashes()
		const gh2 = getGlobalHashes()

		expect(gh1).toBe(gh2)
	})
})
