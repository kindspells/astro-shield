declare function sriCSP(
	distDir: string,
	hashesOutputModule?: string | undefined,
): import('astro').AstroIntegration

declare module '@kindspells/astro-sri-csp' {
	export default sriCSP
}
