type HeaderEntry = {
	headerName: string
	value: string
}

type CommentEntry = {
	comment: string
}

type NetlifyPathHeaders = {
	path: string
	entries: (CommentEntry | HeaderEntry)[]
}

type EmptyLine = ''

export type NetlifyHeadersRawConfig = {
	indentWith: string
	entries: (NetlifyPathHeaders | CommentEntry | EmptyLine)[]
}

const spacesRegex = /^\s+/
const headerRegex =
	/^(?<indent>\s*)(?<name>([a-zA-Z0-9_\-]+)):\s*(?<value>.*)$/i
const commentRegex = /^(?<indent>\s*)(?<comment>#.*)$/i

type ParseContext = {
	indentWith: string | undefined
	entries: NetlifyHeadersRawConfig['entries']
	currentPath: NetlifyPathHeaders | undefined
}

const tryToInitializePathConfig = (
	lineNum: number,
	line: string,
	ctx: ParseContext,
): void => {
	if (line === '') {
		ctx.entries.push(line)
	} else if (line.startsWith('#')) {
		ctx.entries.push({ comment: line })
	} else if (spacesRegex.test(line)) {
		throw new Error('Unexpected indentation') // TODO: better error message, custom error
	} else if (line.startsWith('/')) {
		ctx.currentPath = { path: line, entries: [] }
		ctx.entries.push(ctx.currentPath)
	} else {
		throw new Error(`Bad syntax (line ${lineNum})`) // TODO: better error message, custom error
	}
}

const pushComment = (
	lineNum: number,
	match: RegExpMatchArray,
	currentPath: NetlifyPathHeaders | undefined,
): void => {
	if (match.groups?.comment === undefined) {
		throw new Error(`Bad syntax (line ${lineNum})`) // TODO: better error message, custom error
	}
	currentPath?.entries.push({ comment: match.groups.comment })
}

const pushHeader = (
	lineNum: number,
	match: RegExpMatchArray,
	currentPath: NetlifyPathHeaders | undefined,
): void => {
	if (match.groups?.name === undefined || match.groups?.value === undefined) {
		throw new Error(`Bad syntax (line ${lineNum})`) // TODO: better error message, custom error
	}

	currentPath?.entries.push({
		headerName: match.groups.name,
		value: match.groups.value,
	})
}

const pushEntry = (
	match: RegExpMatchArray,
	lineNum: number,
	line: string,
	pushLine: (
		lineNum: number,
		match: RegExpMatchArray,
		currentPath: NetlifyPathHeaders | undefined,
	) => void,
	ctx: ParseContext,
): void => {
	if (ctx.indentWith === undefined) {
		if (match.groups?.indent === undefined) {
			throw new Error(`Bad syntax (line ${lineNum})`) // TODO: better error message, custom error
		}
		if (match.groups?.indent === '') {
			throw new Error(`Unable to infer indentation (line ${lineNum})`) // TODO: better error message, custom error
		}
		ctx.indentWith = match.groups?.indent
	}

	if (match.groups?.indent === '') {
		if ((ctx.currentPath?.entries.length ?? 0) === 0) {
			throw new Error(`Bad syntax (line ${lineNum})`) // TODO: better error message, custom error
		}
		ctx.currentPath = undefined
		tryToInitializePathConfig(lineNum, line, ctx)
	} else if (match.groups?.indent !== ctx.indentWith) {
		throw new Error('Unexpected indentation') // TODO: better error message, custom error
	} else {
		pushLine(lineNum, match, ctx.currentPath)
	}
}

const processPathLine = (
	lineNum: number,
	line: string,
	ctx: ParseContext,
): void => {
	let match: RegExpMatchArray | null = null

	// biome-ignore lint/suspicious/noAssignInExpressions: <explanation>
	if ((match = commentRegex.exec(line))) {
		pushEntry(match, lineNum, line, pushComment, ctx)
	}
	// biome-ignore lint/suspicious/noAssignInExpressions: <explanation>
	else if ((match = headerRegex.exec(line))) {
		pushEntry(match, lineNum, line, pushHeader, ctx)
	} else if (!spacesRegex.test(line)) {
		if ((ctx.currentPath?.entries.length ?? 0) === 0) {
			throw new Error(`Bad syntax (line ${lineNum})`) // TODO: better error message, custom error
		}
		ctx.currentPath = undefined
		tryToInitializePathConfig(lineNum, line, ctx)
	}
}

export const parseNetlifyHeadersConfig = (
	config: string,
): NetlifyHeadersRawConfig => {
	const ctx: ParseContext = {
		indentWith: undefined,
		entries: [],
		currentPath: undefined,
	}

	for (const [lineNum, line] of config.split('\n').entries()) {
		if (ctx.currentPath === undefined) {
			tryToInitializePathConfig(lineNum, line, ctx)
		} else {
			processPathLine(lineNum, line, ctx)
		}
	}

	return {
		indentWith: ctx.indentWith ?? '\t',
		entries: ctx.entries,
	}
}

// export const readNetlifyHeadersFile =
// 	async (): Promise<NetlifyHeadersRawConfig> => {
// 		//
// 	}
