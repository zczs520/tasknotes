import { App, TFile } from "obsidian";
import { DEFAULT_SETTINGS } from "../../../src/settings/defaults";
import { migrateLegacyViewPaths } from "../../../src/bootstrap/legacyViewPaths";
import { ensureExampleTasks } from "../../../src/bootstrap/exampleTasks";

function host() {
	const app = new App();
	const settings = JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
	return { app, settings, saveSettingsDataOnly: jest.fn().mockResolvedValue(undefined) };
}

it("moves saved legacy default views intact and never changes custom mappings", async () => {
	const plugin = host();
	plugin.settings.commandFileMapping["open-kanban-view"] = "TaskNotes/Views/kanban-default.base";
	plugin.settings.commandFileMapping["open-statistics"] = "Dashboards/Statistics.base";
	await plugin.app.vault.createFolder("TaskNotes/Views");
	await plugin.app.vault.create("TaskNotes/Views/kanban-default.base", "personal layout");
	jest.spyOn(plugin.app.fileManager, "renameFile").mockImplementation(
		async (file, destination) => {
			await plugin.app.vault.rename(file, destination);
		}
	);
	await migrateLegacyViewPaths(plugin as any);
	const file = plugin.app.vault.getAbstractFileByPath(
		"TASKquence/Views/kanban-default.base"
	) as TFile;
	expect(await plugin.app.vault.read(file)).toBe("personal layout");
	expect(plugin.settings.commandFileMapping["open-kanban-view"]).toBe(file.path);
	expect(plugin.settings.commandFileMapping["open-statistics"]).toBe(
		"Dashboards/Statistics.base"
	);
	expect(plugin.saveSettingsDataOnly).toHaveBeenCalledTimes(1);
	await migrateLegacyViewPaths(plugin as any);
	expect(plugin.saveSettingsDataOnly).toHaveBeenCalledTimes(1);
});

it("can explicitly restore missing examples despite the one-time flag, preserving edited examples", async () => {
	const plugin = host();
	plugin.settings.exampleTasksCreated = true;
	const path = "TASKquence/Tasks/示例 Example 01 - 工作规划 Work Planning.md";
	await ensureExampleTasks(plugin as any);
	expect(plugin.app.vault.getAbstractFileByPath(path)).toBeNull();
	await ensureExampleTasks(plugin as any, { restoreMissing: true });
	const file = plugin.app.vault.getAbstractFileByPath(path) as TFile;
	expect(file).toBeInstanceOf(TFile);
	await plugin.app.vault.modify(file, "My edits");
	await ensureExampleTasks(plugin as any, { restoreMissing: true });
	expect(await plugin.app.vault.read(file)).toBe("My edits");
});

it("upgrades existing generated examples to the bilingual prefix", async () => {
	const plugin = host();
	plugin.settings.exampleTasksCreated = true;
	await plugin.app.vault.createFolder("TASKquence/Tasks");
	const legacyPath = "TASKquence/Tasks/示例 01 - 工作规划 Work Planning.md";
	const bilingualPath = "TASKquence/Tasks/示例 Example 01 - 工作规划 Work Planning.md";
	await plugin.app.vault.create(
		legacyPath,
		"---\ntaskType: task\ntaskquenceExample: true\n---\n\nEdited example body"
	);
	jest.spyOn(plugin.app.fileManager, "renameFile").mockImplementation(
		async (file, destination) => {
			await plugin.app.vault.rename(file, destination);
		}
	);

	await ensureExampleTasks(plugin as any);

	const migrated = plugin.app.vault.getAbstractFileByPath(bilingualPath) as TFile;
	expect(migrated).toBeInstanceOf(TFile);
	expect(await plugin.app.vault.read(migrated)).toContain("Edited example body");
	expect(plugin.app.vault.getAbstractFileByPath(legacyPath)).toBeNull();
});

it("records the onboarding decision without creating examples when real task data exists", async () => {
	const plugin = host();
	await plugin.app.vault.create(
		"Existing task.md",
		"---\ntaskType: task\nstatus: open\ntimeEntries: []\n---\n"
	);

	await ensureExampleTasks(plugin as any);

	expect(plugin.settings.exampleTasksCreated).toBe(true);
	expect(
		plugin.app.vault.getAbstractFileByPath(
			"TASKquence/Tasks/示例 Example 01 - 工作规划 Work Planning.md"
		)
	).toBeNull();
	expect(plugin.saveSettingsDataOnly).toHaveBeenCalledTimes(1);
});

it.each([
	["a legacy task tag", "---\ntags: [task]\n---\n"],
	[
		"an existing time entry",
		"---\ntimeEntries:\n  - startTime: 2026-09-10T09:00:00.000Z\n    endTime: 2026-09-10T10:00:00.000Z\n---\n",
	],
])("does not auto-create examples for %s", async (_label, content) => {
	const plugin = host();
	await plugin.app.vault.create("Existing data.md", content);

	await ensureExampleTasks(plugin as any);

	expect(plugin.settings.exampleTasksCreated).toBe(true);
	expect(
		plugin.app.vault.getAbstractFileByPath(
			"TASKquence/Tasks/示例 Example 01 - 工作规划 Work Planning.md"
		)
	).toBeNull();
});

it("still allows an explicit restore when real task data exists", async () => {
	const plugin = host();
	await plugin.app.vault.create("Existing task.md", "---\ntags: [task]\n---\n");

	await ensureExampleTasks(plugin as any, { restoreMissing: true });

	expect(
		plugin.app.vault.getAbstractFileByPath(
			"TASKquence/Tasks/示例 Example 06 - 休闲娱乐 Leisure.md"
		)
	).toBeInstanceOf(TFile);
});
