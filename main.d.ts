export type SriCspOptions = {
	/**
	 * It specifies a directory _inside_ the dist/build directory. This is useful
	 * when working on "hybrid" output mode, as it allows to just scan the
	 * client-side assets, and not the server-side ones.
	 */
	distDir?: string | undefined

	/**
	 * Specifies the path for the auto-generated module that will contain the SRI
	 * hashes. Note that:
	 * - The generated module will be an ESM module
	 * - The generated module should be treated as source code, and not as a build
	 *   artifact.
	 */
	sriHashesModule?: string | undefined
}

export type StrictSriCspOptions = SriCspOptions & { distDir: string }

export function sriCSP(
	sriCspOptions: SriCspOptions,
): import('astro').AstroIntegration

export default sriCSP
