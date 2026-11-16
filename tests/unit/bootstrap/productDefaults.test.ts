import { App, TFile } from "obsidian";
import { DEFAULT_SETTINGS } from "../../../src/settings/defaults";
import { buildSettingsFromLoadedData } from "../../../src/settings/settingsPersistence";
import {
	ensureDefaultBasesViewFiles,
	updateGeneratedTaskIdentity,
} from "../../../src/bootstrap/defaultBasesFiles";
import { ensureProductGuides, PRODUCT_GUIDES } from "../../../src/bootstrap/productGuides";
import { hasFixedTaskIdentity } from "../../../src/bases/helpers";
import { generateBasesFileTemplate } from "../../../src/templates/defaultBasesFiles";
import { createI18nService } from "../../../src/i18n";
import type TaskNotesPlugin from "../../../src/main";

describe("TaskNotes Time product defaults", () => {
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

	it("generates the three enabled Base files and creates an optional file after opt-in", async () => {
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
			app.vault.getAbstractFileByPath("ProductDefaults/open-goals-view.base")
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

	it.each([false, true])(
		"adds a live goals Base for a %s legacy user without rewriting goal notes or existing views",
		async (legacy) => {
			const app = new App();
			const original = "---\ntype: goal\nname: Existing goal\n---\nPersonal notes\n";
			const goalPath = "CustomGoals/Existing.md";
			if (legacy) await app.vault.create(goalPath, original);
			const { settings } = buildSettingsFromLoadedData(
				legacy
					? {
							goalsFolder: "CustomGoals",
							commandFileMapping: { "open-statistics": "MyViews/stats.base" },
						}
					: null
			);
			const plugin = {
				settings,
				i18n: createI18nService({ initialLocale: "zh" }),
			} as TaskNotesPlugin;
			const host = {
				app,
				settings,
				generateTemplate: (id: string) =>
					id === "open-goals-view" ? generateBasesFileTemplate(id, plugin) : undefined,
			};
			const result = await ensureDefaultBasesViewFiles(host);
			const path = settings.commandFileMapping["open-goals-view"];
			expect(path).toBe("TASKquence/Views/goals.base");
			expect(result.created).toContain(path);
			const file = app.vault.getAbstractFileByPath(path) as TFile;
			expect(await app.vault.read(file)).toContain("type: tasknotesGoals");
			expect(await app.vault.read(file)).toContain('name: "目标管理"');
			expect(await app.vault.read(file)).not.toContain("Existing goal");
			if (legacy) {
				expect(
					await app.vault.read(app.vault.getAbstractFileByPath(goalPath) as TFile)
				).toBe(original);
				expect(settings.commandFileMapping["open-statistics"]).toBe("MyViews/stats.base");
			}
			await app.vault.modify(file, "my customized Base");
			expect((await ensureDefaultBasesViewFiles(host)).created).toHaveLength(0);
			expect(await app.vault.read(file)).toBe("my customized Base");
		}
	);

	it("respects a disabled goals view and a custom goals Base path", async () => {
		const app = new App();
		const { settings } = buildSettingsFromLoadedData({
			enabledViews: { "open-goals-view": false },
			commandFileMapping: { "open-goals-view": "MyViews/goals.base" },
		});
		const host = {
			app,
			settings,
			generateTemplate: (id: string) =>
				id === "open-goals-view" ? "views:\n  - type: tasknotesGoals\n" : undefined,
		};
		await ensureDefaultBasesViewFiles(host);
		expect(app.vault.getAbstractFileByPath("MyViews/goals.base")).toBeNull();
		settings.enabledViews["open-goals-view"] = true;
		expect((await ensureDefaultBasesViewFiles(host)).created).toContain("MyViews/goals.base");
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
