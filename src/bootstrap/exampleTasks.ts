import type TaskNotesPlugin from "../main";
import { TFile } from "obsidian";
import { parse } from "yaml";
import { ensureFolderHierarchy } from "./defaultBasesFiles";
import { buildExampleTaskNotes } from "./exampleTaskNotes";

const LEGACY_EXAMPLE_NAMES = [
	["示例 01 - 工作规划 Work Planning", "示例 Example 01 - 工作规划 Work Planning"],
	["示例 02 - 学习进阶 Study and Learning", "示例 Example 02 - 学习进阶 Study and Learning"],
	["示例 03 - 创作输出 Creative Work", "示例 Example 03 - 创作输出 Creative Work"],
	["示例 04 - 健身训练 Fitness Training", "示例 Example 04 - 健身训练 Fitness Training"],
	["示例 05 - 生活家务 Life and Home", "示例 Example 05 - 生活家务 Life and Home"],
	["示例 06 - 休闲娱乐 Leisure", "示例 Example 06 - 休闲娱乐 Leisure"],
] as const;

function parseFrontmatter(content: string): Record<string, unknown> | null {
	const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
	if (!match) return null;
	try {
		const frontmatter = parse(match[1] || "");
		return frontmatter && typeof frontmatter === "object" && !Array.isArray(frontmatter)
			? (frontmatter as Record<string, unknown>)
			: null;
	} catch {
		return null;
	}
}

function containsConfiguredTaskTag(value: unknown, configuredTag: string): boolean {
	const target = configuredTag.replace(/^#/, "");
	const tags = Array.isArray(value) ? value : typeof value === "string" ? [value] : [];
	return tags.some((tag) =>
		String(tag)
			.split(/[\s,]+/)
			.map((item) => item.replace(/^#/, ""))
			.includes(target)
	);
}

async function migrateLegacyExampleNames(plugin: TaskNotesPlugin): Promise<void> {
	for (const [legacyName, bilingualName] of LEGACY_EXAMPLE_NAMES) {
		const legacyPath = `TASKquence/Tasks/${legacyName}.md`;
		const bilingualPath = `TASKquence/Tasks/${bilingualName}.md`;
		const legacyFile = plugin.app.vault.getAbstractFileByPath(legacyPath);
		if (!(legacyFile instanceof TFile) || plugin.app.vault.getAbstractFileByPath(bilingualPath)) {
			continue;
		}
		let frontmatter = plugin.app.metadataCache.getFileCache(legacyFile)?.frontmatter as
			| Record<string, unknown>
			| undefined;
		if (!frontmatter) {
			try {
				frontmatter = parseFrontmatter(await plugin.app.vault.read(legacyFile)) ?? undefined;
			} catch {
				continue;
			}
		}
		if (frontmatter?.taskquenceExample !== true) continue;
		await plugin.app.fileManager.renameFile(legacyFile, bilingualPath);
	}
}

/** Existing real task data always wins over automatic onboarding examples. */
export async function hasExistingUserTaskData(plugin: TaskNotesPlugin): Promise<boolean> {
	const timeEntriesField = plugin.settings.fieldMapping.timeEntries;
	for (const file of plugin.app.vault.getMarkdownFiles()) {
		const cached = plugin.app.metadataCache.getFileCache(file)?.frontmatter as
			| Record<string, unknown>
			| undefined;
		let frontmatter = cached;
		if (!frontmatter) {
			try {
				frontmatter = parseFrontmatter(await plugin.app.vault.read(file)) ?? undefined;
			} catch {
				continue;
			}
		}
		if (!frontmatter || frontmatter.taskquenceExample === true) continue;

		if (
			frontmatter.taskType === "task" ||
			(Array.isArray(frontmatter[timeEntriesField]) &&
				(frontmatter[timeEntriesField] as unknown[]).length > 0) ||
			containsConfiguredTaskTag(frontmatter.tags, plugin.settings.taskTag)
		) {
			return true;
		}
	}
	return false;
}

export async function ensureExampleTasks(
	plugin: TaskNotesPlugin,
	options: { restoreMissing?: boolean } = {}
): Promise<void> {
	await migrateLegacyExampleNames(plugin);
	if (plugin.settings.exampleTasksCreated && !options.restoreMissing) return;
	const settings = plugin.settings;
	if (!options.restoreMissing && (await hasExistingUserTaskData(plugin))) {
		settings.exampleTasksCreated = true;
		await plugin.saveSettingsDataOnly();
		return;
	}
	const fields = settings.fieldMapping;
	const notes = buildExampleTaskNotes({
		status: settings.defaultTaskStatus,
		completedStatus:
			settings.customStatuses.find((status) => status.isCompleted)?.value ??
			settings.defaultTaskStatus,
		statusField: fields.status,
		priorityField: fields.priority,
		scheduledField: fields.scheduled,
		timeEntriesField: fields.timeEntries,
	});
	await ensureFolderHierarchy(plugin.app.vault, "TASKquence/Tasks");
	for (const note of notes) {
		if (!(await plugin.app.vault.adapter.exists(note.path))) {
			await plugin.app.vault.create(note.path, note.content);
		}
	}
	settings.exampleTasksCreated = true;
	await plugin.saveSettingsDataOnly();
}
