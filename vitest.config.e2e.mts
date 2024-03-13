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
			exclude: [
				'tests/**/*',
				'e2e/**/*',
				'coverage/**/*',
				'coverage-e2e/**/*',
				'coverage-unit/**/*',
			],
			thresholds: {
				statements: 25.0,
				branches: 50.0,
				functions: 12.5,
				lines: 25.0,
			},
			reportsDirectory: 'coverage-e2e',
			reporter: [],
		},
		include: ['e2e/**/*.test.mts'],
	},
})
