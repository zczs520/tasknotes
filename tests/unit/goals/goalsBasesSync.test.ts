import { Events, type QueryController } from "obsidian";
import type TaskNotesPlugin from "../../../src/main";
import { GoalsBasesView } from "../../../src/bases/GoalsView";
import { GoalManagementPanel } from "../../../src/ui/goals/GoalManagementPanel";
import { GoalService } from "../../../src/services/GoalService";
import { DEFAULT_SETTINGS } from "../../../src/settings/defaults";
import { createI18nService } from "../../../src/i18n";
import { createMockApp } from "../../helpers/obsidian-runtime";

const goalContent = `---
type: goal
name: Existing
created: "2026-01-01"
mode: floor
target: 5h
period: weekly
scope: [work]
milestones:
  - name: Users
    kind: number
    current: 0
    tiers: [10, 100]
    achieved: {}
    hours_at: {}
---
`;

describe("live goals Base", () => {
	beforeEach(() => jest.useFakeTimers());
	afterEach(() => {
		jest.useRealTimers();
		document.body.replaceChildren();
	});

	function setup(initialFiles: Record<string, string> = { "Goals/Existing.md": goalContent }) {
		const app = createMockApp(initialFiles);
		const plugin = {
			app,
			emitter: new Events(),
			settings: { ...DEFAULT_SETTINGS, goalsFolder: "Goals" },
			i18n: createI18nService({ initialLocale: "zh" }),
			onReady: async () => {},
			registerEvent: jest.fn(),
			cacheManager: { getAllTasks: async () => [] },
		} as unknown as TaskNotesPlugin;
		plugin.goalService = new GoalService(plugin);
		const root = document.body.createDiv();
		const base = new GoalsBasesView({} as QueryController, root, plugin);
		base.load();
		const secondRoot = document.body.createDiv();
		const secondPanel = new GoalManagementPanel(plugin, secondRoot);
		secondPanel.load();
		const flush = () => jest.advanceTimersByTimeAsync(150);
		const names = (el: HTMLElement) =>
			Array.from(
				el.querySelectorAll(".tn-goals-view__identity strong"),
				(node) => node.textContent
			);
		return { app, plugin, base, root, secondPanel, secondRoot, flush, names };
	}

	it("loads existing goals and synchronizes additions, edits, renames, milestones and deletion in both dashboards", async () => {
		const { app, plugin, base, root, secondPanel, secondRoot, flush, names } = setup();
		try {
			await flush();
			expect(names(root)).toEqual(["Existing"]);
			expect(names(secondRoot)).toEqual(["Existing"]);
			await app.vault.create(
				"Goals/New.md",
				goalContent.replace("name: Existing", "name: New")
			);
			await flush();
			expect(names(root)).toEqual(["Existing", "New"]);
			expect(names(secondRoot)).toEqual(["Existing", "New"]);
			await plugin.goalService.updateGoalDetails("Goals/Existing.md", { name: "Updated" });
			await plugin.goalService.updateMilestone("Goals/Existing.md", 0, 25);
			await flush();
			expect(names(root)).toContain("Updated");
			expect(names(secondRoot)).toContain("Updated");
			for (const el of [root, secondRoot]) {
				expect(
					Array.from(
						el.querySelectorAll(".tn-goal-stock__value"),
						(node) => node.textContent
					)
				).toContain("25 → 100");
			}
			await app.vault.rename(app.vault.getFileByPath("Goals/New.md")!, "Outside/New.md");
			await flush();
			expect(names(root)).toEqual(["Updated"]);
			expect(names(secondRoot)).toEqual(["Updated"]);
			await plugin.goalService.deleteGoal("Goals/Existing.md", false);
			await flush();
			expect(names(root)).toEqual([]);
			expect(names(secondRoot)).toEqual([]);
		} finally {
			base.unload();
			secondPanel.unload();
		}
	});

	it("refreshes an empty dashboard when a goal appears, follows folder changes and stops after closing", async () => {
		const { app, plugin, base, root, secondPanel, flush, names } = setup({});
		try {
			await flush();
			expect(names(root)).toEqual([]);
			await app.vault.create("Goals/Existing.md", goalContent);
			await flush();
			expect(names(root)).toEqual(["Existing"]);
			plugin.settings.goalsFolder = "MovedGoals";
			plugin.emitter.trigger("settings-changed", plugin.settings);
			await flush();
			expect(names(root)).toEqual([]);
			await app.vault.rename(
				app.vault.getFileByPath("Goals/Existing.md")!,
				"MovedGoals/Existing.md"
			);
			await flush();
			expect(names(root)).toEqual(["Existing"]);
			base.unload();
			const getProgress = jest.spyOn(plugin.goalService, "getProgress");
			secondPanel.unload();
			app.vault.trigger("modify", { path: "MovedGoals/Existing.md" });
			await flush();
			expect(getProgress).not.toHaveBeenCalled();
			expect(root.children).toHaveLength(0);
		} finally {
			base.unload();
			secondPanel.unload();
		}
	});

	it("refreshes both dashboards from full numeric progress to zero after undoing every tier", async () => {
		const { plugin, base, root, secondPanel, secondRoot, flush } = setup();
		try {
			await flush();
			await plugin.goalService.updateMilestone("Goals/Existing.md", 0, 200);
			await flush();
			for (const el of [root, secondRoot])
				expect(
					el.querySelector('[role="progressbar"]')?.getAttribute("aria-valuenow")
				).toBe("100");
			await plugin.goalService.undoMilestoneAchievement("Goals/Existing.md", 0, 100);
			await flush();
			for (const el of [root, secondRoot]) {
				expect(el.querySelector(".tn-goal-stock__value")?.textContent).toBe("10 → 100");
				expect(
					el.querySelector('[role="progressbar"]')?.getAttribute("aria-valuenow")
				).toBe("50");
			}
			await plugin.goalService.undoMilestoneAchievement("Goals/Existing.md", 0, 10);
			await flush();
			for (const el of [root, secondRoot]) {
				expect(el.querySelector(".tn-goal-stock__value")?.textContent).toBe("0 → 10");
				expect(
					el.querySelector('[role="progressbar"]')?.getAttribute("aria-valuenow")
				).toBe("0");
				expect(el.querySelectorAll(".tn-goal-stock__tier.is-achieved")).toHaveLength(0);
				expect(el.querySelector(".tn-goals-view__milestone-count")?.textContent).toBe(
					"0/1"
				);
			}
		} finally {
			base.unload();
			secondPanel.unload();
		}
	});
});
