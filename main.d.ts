declare module '@kindspells/astro-sri-csp' {
	function sriCSP(
		distDir: string,
		hashesOutputModule?: string | undefined,
	): import('astro').AstroIntegration

	export default sriCSP
}
