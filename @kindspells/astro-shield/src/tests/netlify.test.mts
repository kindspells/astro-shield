import { describe, expect, it } from 'vitest'

import type { NetlifyHeadersRawConfig } from '../netlify.mts'
import { parseNetlifyHeadersConfig } from '../netlify.mts'

describe('parseNetlifyHeadersConfig', () => {
	const testEntries = [
		{ comment: '# This is a test config file' },
		'',
		{
			path: '/index.html',
			entries: [
				{ comment: '# Nested Comment' },
				{ headerName: 'X-Frame-Options', value: 'DENY' },
				{ headerName: 'X-XSS-Protection', value: '1; mode=block' },
			],
		},
		{
			path: '/es/index.html',
			entries: [
				{ headerName: 'X-Frame-Options', value: 'DENY' },
				{ headerName: 'X-XSS-Protection', value: '1; mode=block' },
			],
		},
		'',
	] satisfies NetlifyHeadersRawConfig['entries']

	it('parses a valid config (tabs)', () => {
		const config = `# This is a test config file

/index.html
	# Nested Comment
	X-Frame-Options: DENY
	X-XSS-Protection: 1; mode=block
/es/index.html
	X-Frame-Options: DENY
	X-XSS-Protection: 1; mode=block
`
		const parsed = parseNetlifyHeadersConfig(config)
		expect(parsed).toEqual({
			indentWith: '\t',
			entries: testEntries,
		} satisfies NetlifyHeadersRawConfig)
	})
})
