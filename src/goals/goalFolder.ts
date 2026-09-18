import { normalizePath } from "obsidian";

export const DEFAULT_GOALS_FOLDER = "TASKquence/Tasks/Goals";

export function normalizeGoalsFolder(value: string | undefined): string {
	const path = normalizePath((value ?? "").trim().replace(/\\/gu, "/")).replace(/^\/+|\/+$/gu, "");
	return path || DEFAULT_GOALS_FOLDER;
}
