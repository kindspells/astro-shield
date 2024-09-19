import { describe, expect, it } from 'vitest'

import { exhaustiveGuard } from '../utils.mts'

describe('exhaustiveGuard', () => {
	it('does something', () => {
		expect(() => exhaustiveGuard('x' as never, 'something')).toThrowError(
			'Unknown something: x',
		)
	})
})
