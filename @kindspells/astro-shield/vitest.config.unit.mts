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
			include: ['src/*.mts'],
			exclude: [
				'src/tests/**/*',
				'src/e2e/**/*',
				'src/types.mts',
				'coverage/**/*',
				'coverage-e2e/**/*',
				'coverage-unit/**/*',
			],
			thresholds: {
				statements: 76.0,
				branches: 80.0,
				functions: 86.0,
				lines: 76.0,
			},
			reportsDirectory: 'coverage-unit',
		},
		include: ['src/**/tests/**/*.test.mts'],
	},
})
