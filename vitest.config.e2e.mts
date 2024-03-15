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
			include: ['src/*.mjs'],
			exclude: [
				'tests/**/*',
				'e2e/**/*',
				'coverage/**/*',
				'coverage-e2e/**/*',
				'coverage-unit/**/*',
			],
			thresholds: {
				statements: 20.0,
				branches: 50.0,
				functions: 10.0,
				lines: 20.0,
			},
			reportsDirectory: 'coverage-e2e',
		},
		include: ['e2e/**/*.test.mts'],
	},
})
