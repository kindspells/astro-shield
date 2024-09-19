/** @internal */
export const exhaustiveGuard = (_v: never, caseName: string): void => {
	throw new Error(`Unknown ${caseName}: ${_v}`)
}
