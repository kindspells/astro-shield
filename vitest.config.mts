/*
 * SPDX-FileCopyrightText: 2024 KindSpells Labs S.L.
 *
 * SPDX-License-Identifier: MIT
 */

import { defineConfig } from 'vitest/config'

export default defineConfig({
	test: {
		coverage: {
			provider: 'v8',
			include: ['*.mjs'],
			exclude: ['tests/**/*'],
			thresholds: {
				branches: 60.0,
				lines: 50.0,
				functions: 50.0,
				statements: 60.0,
			},
		},
	},
})
