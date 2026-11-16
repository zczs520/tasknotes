import { normalizePath } from "obsidian";
import { DEFAULT_GOALS_FOLDER } from "./goalTypes";

export { DEFAULT_GOALS_FOLDER } from "./goalTypes";

export function normalizeGoalsFolder(value: string | undefined): string {
	const path = normalizePath((value ?? "").trim().replace(/\\/gu, "/")).replace(/^\/+|\/+$/gu, "");
	return path || DEFAULT_GOALS_FOLDER;
}
