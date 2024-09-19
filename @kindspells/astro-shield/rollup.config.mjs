import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { getTsconfig } from 'get-tsconfig'
import { defineConfig } from 'rollup'
import { dts } from 'rollup-plugin-dts'
import esbuild from 'rollup-plugin-esbuild'

const projectDir = dirname(fileURLToPath(import.meta.url))
const tsconfig = getTsconfig(projectDir)
const target = tsconfig?.config.compilerOptions?.target ?? 'es2022'

const baseConfig = {
	plugins: [
		esbuild({
			target: ['node18', 'node20', 'node22', target],
			loaders: { '.mts': 'ts' },
			keepNames: true,
			minifyIdentifiers: true,
			minifySyntax: true,
			minifyWhitespace: false,
			treeShaking: true,
		}),
	],
	external: ['node:crypto', 'node:fs/promises', 'node:path', 'node:url'],
}

const outputConfig = /** @type {import('rollup').OutputOptions} */ ({
	format: 'esm',
	indent: '\t', // With any luck, some day esbuild will support this option
	sourcemap: true,
})

export default defineConfig([
	{
		input: 'src/core.mts',
		output: [{ ...outputConfig, file: 'dist/core.mjs' }],
		...baseConfig,
	},
	{
		input: 'src/main.mts',
		output: [{ ...outputConfig, file: 'dist/main.mjs' }],
		external: ['#as/core'],
		...baseConfig,
	},
	{
		input: 'src/state.mts',
		output: [{ ...outputConfig, file: 'dist/state.mjs' }],
		...baseConfig,
	},
	{
		input: 'src/main.mts',
		output: [{ format: 'esm', file: 'dist/main.d.mts' }],
		external: ['#as/core'],
		// TODO: When possible, pass `noCheck: true` instead of loading an entire tsconfig file
		plugins: [dts({ tsconfig: resolve(projectDir, 'tsconfig.dts.json') })],
	},
])
