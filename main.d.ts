export type SriCspOptions = {
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
