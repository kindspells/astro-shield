declare function sriCSP(
	distDir: string,
	hashesOutputModule?: string | undefined,
): {
	name: string
	hooks: {
		'astro:build:done': () => Promise<void>
		'astro:server:setup': () => Promise<void>
	}
}
