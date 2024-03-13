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
				statements: 70.0,
				branches: 75.0,
				functions: 70.0,
				lines: 70.0,
			},
			reportsDirectory: 'coverage-unit',
		},
		include: ['tests/**/*.test.mts'],
	},
})
