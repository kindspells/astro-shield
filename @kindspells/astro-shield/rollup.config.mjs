import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

import { getTsconfig } from 'get-tsconfig'
import { defineConfig } from 'rollup'
import dts from 'rollup-plugin-dts'
import esbuild from 'rollup-plugin-esbuild'

const projectDir = dirname(fileURLToPath(import.meta.url))
const tsconfig = getTsconfig(projectDir)
const target = tsconfig?.config.compilerOptions?.target ?? 'es2020'

const outputBaseConfig = {
	plugins: [
		esbuild({
			target: ['node18', 'node20', 'node22', target],
			loaders: { '.mts': 'ts' },
			minify: true,
		}),
	],
	external: ['node:crypto', 'node:fs/promises', 'node:path', 'node:url'],
}

export default defineConfig([
	{
		input: 'src/core.mts',
		output: [{ format: 'esm', file: 'dist/core.mjs', sourcemap: true }],
		...outputBaseConfig,
	},
	{
		input: 'src/main.mts',
		output: [{ format: 'esm', file: 'dist/main.mjs', sourcemap: true }],
		external: ['#as/core'],
		...outputBaseConfig,
	},
	{
		input: 'src/state.mts',
		output: [{ format: 'esm', file: 'dist/state.mjs', sourcemap: true }],
		...outputBaseConfig,
	},
	{
		input: 'src/main.mts',
		output: [{ format: 'esm', file: 'dist/main.d.mts' }],
		external: ['#as/core'],
		plugins: [dts()],
	},
])
