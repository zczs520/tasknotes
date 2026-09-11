import { App, TFile } from "obsidian";
import { DEFAULT_SETTINGS } from "../../../src/settings/defaults";
import { buildSettingsFromLoadedData } from "../../../src/settings/settingsPersistence";
import {
	ensureDefaultBasesViewFiles,
	updateGeneratedTaskIdentity,
} from "../../../src/bootstrap/defaultBasesFiles";
import { ensureProductGuides, PRODUCT_GUIDES } from "../../../src/bootstrap/productGuides";
import { hasFixedTaskIdentity } from "../../../src/bases/helpers";

describe("TASKquence product defaults", () => {
	it("locks the identity when loading legacy settings and preserves opt-in views and custom folders", () => {
		const { settings } = buildSettingsFromLoadedData({
			taskIdentificationMethod: "tag",
			taskPropertyName: "kind",
			taskPropertyValue: "todo",
			tasksFolder: "My tasks",
			enabledViews: { "open-calendar-view": true },
		});
		expect(settings).toMatchObject({
			taskIdentificationMethod: "property",
			taskPropertyName: "taskType",
			taskPropertyValue: "task",
			tasksFolder: "My tasks",
		});
		expect(settings.enabledViews["open-calendar-view"]).toBe(true);
		expect(settings.enabledViews["open-agenda-view"]).toBe(false);
		expect(buildSettingsFromLoadedData(settings).shouldPersistMigratedSettings).toBe(false);
	});

	it("generates only the two enabled Base files and creates an optional file after opt-in", async () => {
		const app = new App();
		const settings = JSON.parse(JSON.stringify(DEFAULT_SETTINGS)) as typeof DEFAULT_SETTINGS;
		for (const id of Object.keys(settings.commandFileMapping)) {
			settings.commandFileMapping[id] = `ProductDefaults/${id}.base`;
		}
		const host = { app, settings, generateTemplate: () => "views: []" };
		await ensureDefaultBasesViewFiles(host);
		expect(
			app.vault.getAbstractFileByPath("ProductDefaults/open-kanban-view.base")
		).toBeInstanceOf(TFile);
		expect(
			app.vault.getAbstractFileByPath("ProductDefaults/open-statistics.base")
		).toBeInstanceOf(TFile);
		expect(
			app.vault.getAbstractFileByPath("ProductDefaults/open-calendar-view.base")
		).toBeNull();
		settings.enabledViews["open-calendar-view"] = true;
		await ensureDefaultBasesViewFiles(host);
		const calendar = app.vault.getAbstractFileByPath(
			"ProductDefaults/open-calendar-view.base"
		) as TFile;
		expect(calendar).toBeInstanceOf(TFile);
		await app.vault.modify(calendar, "personalized view");
		settings.enabledViews["open-calendar-view"] = false;
		await ensureDefaultBasesViewFiles(host, { overwriteExisting: true });
		expect(await app.vault.read(calendar)).toBe("personalized view");
	});

	it("updates generated legacy identity without replacing additional filters or layout", () => {
		const original =
			'# Kanban Board\nfilters:\n  and:\n    - file.hasTag("task")\n    - status != "done"\nviews:\n  - type: tasknotesKanban\n    columnWidth: 350\n';
		const updated = updateGeneratedTaskIdentity("open-kanban-view", original);
		expect(updated).toBe(original.replace('file.hasTag("task")', 'note["taskType"] == "task"'));
		expect(updateGeneratedTaskIdentity("open-kanban-view", updated)).toBe(updated);
		expect(
			updateGeneratedTaskIdentity(
				"open-kanban-view",
				original.replace("# Kanban Board", "# My board")
			)
		).toContain('note["taskType"] == "task"');
	});

	it("excludes non-task notes from boards and time statistics even if Base filters are removed", () => {
		expect(hasFixedTaskIdentity({ properties: { taskType: "task", tags: [] } })).toBe(true);
		expect(hasFixedTaskIdentity({ frontmatter: { taskType: "task" } })).toBe(true);
		expect(hasFixedTaskIdentity({ properties: { tags: ["task"], timeEntries: [{}] } })).toBe(
			false
		);
		expect(hasFixedTaskIdentity({ properties: { taskType: "project" } })).toBe(false);
	});

	it("creates bilingual guides and the App folder without overwriting user edits or identifying guides as tasks", async () => {
		const app = new App();
		await ensureProductGuides(app);
		for (const guide of PRODUCT_GUIDES) {
			const file = app.vault.getAbstractFileByPath(guide.path);
			expect(file).toBeInstanceOf(TFile);
			expect(guide.content.startsWith("---")).toBe(false);
		}
		const file = app.vault.getAbstractFileByPath("TASKquence/看板使用说明.md") as TFile;
		await app.vault.modify(file, "My annotations");
		await ensureProductGuides(app);
		expect(await app.vault.read(file)).toBe("My annotations");
	});
});
