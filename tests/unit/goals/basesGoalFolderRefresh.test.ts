import { Events } from "obsidian";
import type TaskNotesPlugin from "../../../src/main";
import { KanbanView } from "../../../src/bases/KanbanView";
import { TimeStatisticsView } from "../../../src/bases/TimeStatisticsView";
import { GoalService } from "../../../src/services/GoalService";
import { DEFAULT_SETTINGS } from "../../../src/settings/defaults";
import { createI18nService } from "../../../src/i18n";
import { renderGoalProgressPanel } from "../../../src/ui/goals/GoalProgressPanel";
import { createMockApp } from "../../helpers/obsidian-runtime";

const content = `---
type: goal
name: Practice
created: "2026-09-01"
mode: floor
target: 5h
period: weekly
scope: [practice]
---
`;

describe.each([
	["Kanban", KanbanView, "strip"],
	["Statistics", TimeStatisticsView, "statistics"],
] as const)("%s goal folder refresh", (_name, View, variant) => {
	beforeEach(() => jest.useFakeTimers());
	afterEach(() => {
		jest.useRealTimers();
		document.body.replaceChildren();
	});

	function setup(goalsFolder = "Goals") {
		const app = createMockApp({ "Goals/Practice.md": content });
		const emitter = new Events();
		const plugin = {
			app,
			emitter,
			settings: { ...DEFAULT_SETTINGS, goalsFolder },
			i18n: createI18nService(),
			registerEvent: jest.fn(),
		} as unknown as TaskNotesPlugin;
		plugin.goalService = new GoalService(plugin);
		const root = document.body.createDiv();
		const view = new View({}, root, plugin);
		Object.assign(view, {
			rootElement: root,
			setupContainer: () => undefined,
			setupTaskUpdateListener: () => undefined,
			setupSelectionHandling: () => undefined,
			updateRelevantPathsCache: () => undefined,
			readViewOptions: () => undefined,
		});
		const render = jest.spyOn(view, "render").mockImplementation(async () => {
			root.replaceChildren();
			await renderGoalProgressPanel(root, plugin, [], {
				variant,
				period: "week",
				onRefresh: () => undefined,
			});
		});
		view.load();
		return { app, emitter, plugin, view, root, render };
	}

	it("discovers existing goals moved into the configured folder while the panel is empty", async () => {
		const { app, view, root } = setup("TASKquence/Tasks/Goals");
		await jest.advanceTimersByTimeAsync(350);
		expect(root.textContent).not.toContain("Practice");
		await app.vault.rename(app.vault.getFileByPath("Goals/Practice.md")!, "TASKquence/Tasks/Goals/Practice.md");
		await jest.advanceTimersByTimeAsync(350);
		expect(root.textContent).toContain("Practice");
		view.unload();
	});

	it("replaces the empty panel after switching folders and moving a goal excluded from task results", async () => {
		const { app, emitter, plugin, view, root } = setup();
		await jest.advanceTimersByTimeAsync(350);
		expect(root.textContent).toContain("Practice");
		plugin.settings.goalsFolder = "TASKquence/Tasks/Goals";
		emitter.trigger("settings-changed", plugin.settings);
		await jest.advanceTimersByTimeAsync(350);
		expect(root.textContent).not.toContain("Practice");
		await app.vault.rename(app.vault.getFileByPath("Goals/Practice.md")!, "TASKquence/Tasks/Goals/Practice.md");
		await jest.advanceTimersByTimeAsync(350);
		expect(root.textContent).toContain("Practice");
		view.unload();
	});

	it("refreshes for file changes and folder moves, ignores unrelated events, and cleans up on unload", async () => {
		const { app, emitter, plugin, view, root, render } = setup();
		await jest.advanceTimersByTimeAsync(350);
		render.mockClear();
		emitter.trigger("settings-changed", plugin.settings);
		app.vault.trigger("modify", { path: "Goals-extra/Other.md" });
		await jest.advanceTimersByTimeAsync(350);
		expect(render).not.toHaveBeenCalled();
		for (const event of ["create", "modify", "delete"]) {
			app.vault.trigger(event, { path: "Goals/Practice.md" });
			await jest.advanceTimersByTimeAsync(350);
		}
		app.vault.trigger("rename", { path: "MovedGoals" }, "Goals");
		await jest.advanceTimersByTimeAsync(350);
		expect(render).toHaveBeenCalledTimes(4);
		root.remove();
		app.vault.trigger("modify", { path: "Goals/Practice.md" });
		await jest.advanceTimersByTimeAsync(350);
		expect(render).toHaveBeenCalledTimes(4);
		view.unload();
		document.body.appendChild(root);
		app.vault.trigger("modify", { path: "Goals/Practice.md" });
		plugin.settings.goalsFolder = "Another/Goals";
		emitter.trigger("settings-changed", plugin.settings);
		await jest.advanceTimersByTimeAsync(350);
		expect(render).toHaveBeenCalledTimes(4);
	});
});
