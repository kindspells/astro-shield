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
				statements: 70.0,
				branches: 75.0,
				functions: 60.0,
				lines: 70.0,
			},
		},
	},
})
