/*
 * SPDX-FileCopyrightText: 2024 KindSpells Labs S.L.
 *
 * SPDX-License-Identifier: MIT
 */

export type MiddlewareHashes = {
	scripts: Map<string, string>
	styles: Map<string, string>
}

export type PerPageHashes = { scripts: Set<string>; styles: Set<string> }
export type PerPageHashesCollection = Map<string, PerPageHashes>

export type HashesCollection = {
	inlineScriptHashes: Set<string>
	inlineStyleHashes: Set<string>
	extScriptHashes: Set<string>
	extStyleHashes: Set<string>
	perPageSriHashes: PerPageHashesCollection
	perResourceSriHashes: MiddlewareHashes
}

export type Logger = {
	info(msg: string): void
	warn(msg: string): void
	error(msg: string): void
}
