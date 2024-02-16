// eslint-disable-next-line import/no-unresolved
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
