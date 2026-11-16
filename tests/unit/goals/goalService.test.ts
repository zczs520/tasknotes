import type TaskNotesPlugin from "../../../src/main";
import type { TaskInfo } from "../../../src/types";
import { GoalService } from "../../../src/services/GoalService";
import { createMockApp } from "../../helpers/obsidian-runtime";
import { milestoneProgress } from "../../../src/goals/goalCalculations";
import { isGoalMilestoneComplete } from "../../../src/goals/milestoneStages";
import { collectGoalMilestoneEvents } from "../../../src/goals/goalMilestoneEvents";

const content = `---
type: goal
name: Developer
created: 2026-09-17
mode: floor
target: 10h
period: weekly
scope:
  - work/dev
settings_history:
  - date: 2026-09-17
    target: 10
    period: weekly
milestones:
  - name: Revenue
    kind: number
    current: 0
    tiers: [10, 100]
    achieved: {}
    hours_at: {}
---

## 为什么

Keep creating
`;

function setup(goalContent = content) {
	const app = createMockApp({ "Goals/Developer.md": goalContent });
	const getAllTasks = jest.fn().mockResolvedValue([]);
	const plugin = {
		app,
		registerEvent: jest.fn(),
		settings: { goalsFolder: "Goals", calendarViewSettings: { firstDay: 1 } },
		cacheManager: { getAllTasks },
	} as unknown as TaskNotesPlugin;
	return { app, plugin, service: new GoalService(plugin), getAllTasks };
}

describe("goal service historical attribution and cached reads", () => {
	it("rolls numeric progress back one achieved tier at a time and reaches zero after all undos", async () => {
		jest.useFakeTimers().setSystemTime(new Date("2026-11-16T12:00:00"));
		try {
			const { service } = setup(content.replace("tiers: [10, 100]", "tiers: [10, 50, 100]"));
			const path = "Goals/Developer.md";
			await service.updateMilestone(path, 0, 200);
			for (const [tier, expected, keys] of [
				[100, 50, ["10", "50"]],
				[50, 10, ["10"]],
				[10, 0, []],
			] as const) {
				await service.undoMilestoneAchievement(path, 0, tier);
				const goal = (await service.getGoal(path))!;
				const milestone = goal.milestones[0];
				expect(milestone.current).toBe(expected);
				expect(Object.keys(milestone.achieved!)).toEqual(keys);
				expect(Object.keys(milestone.hours_at!)).toEqual(keys);
				expect(milestoneProgress(milestone)).toBe(
					expected === 50 ? 2 / 3 : expected === 10 ? 1 / 3 : 0
				);
				expect(isGoalMilestoneComplete(milestone)).toBe(false);
				expect(milestone.progressHistory).toEqual([
					{ date: "2026-11-16", value: expected },
				]);
				const events = collectGoalMilestoneEvents([goal], {
					start: new Date("2026-11-16"),
					end: new Date("2026-11-17"),
				});
				expect(events.some((event) => event.value === 200 || event.completed)).toBe(false);
			}
			await service.updateMilestone(path, 0, 60);
			expect((await service.getGoal(path))!.milestones[0].achieved).toEqual({
				"10": "2026-11-16",
				"50": "2026-11-16",
			});
		} finally {
			jest.useRealTimers();
		}
	});

	it("cascades numeric undo to later tiers, keeps earlier history and does not reapply a repeated undo", async () => {
		jest.useFakeTimers().setSystemTime(new Date("2026-11-15T12:00:00"));
		try {
			const { app, service } = setup(
				content.replace("tiers: [10, 100]", "tiers: [10, 50, 100]")
			);
			const path = "Goals/Developer.md";
			await service.updateMilestone(path, 0, 200);
			jest.setSystemTime(new Date("2026-11-16T12:00:00"));
			await service.undoMilestoneAchievement(path, 0, 50);
			let milestone = (await service.getGoal(path))!.milestones[0];
			expect(milestone.current).toBe(10);
			expect(milestone.achieved).toEqual({ "10": "2026-11-15" });
			expect(milestone.progressHistory).toEqual([
				{ date: "2026-11-15", value: 200 },
				{ date: "2026-11-16", value: 10 },
			]);
			await service.updateMilestone(path, 0, 20);
			const file = app.vault.getFileByPath(path)!;
			const before = await app.vault.read(file);
			await service.undoMilestoneAchievement(path, 0, 50);
			expect(await app.vault.read(file)).toBe(before);
			milestone = (await service.getGoal(path))!.milestones[0];
			expect(milestone.current).toBe(20);
		} finally {
			jest.useRealTimers();
		}
	});

	it("can clear residual numeric progress left after all records were undone by older versions", async () => {
		const { service } = setup(content.replace("current: 0", "current: 200"));
		const path = "Goals/Developer.md";
		await service.undoMilestoneAchievement(path, 0);
		const milestone = (await service.getGoal(path))!.milestones[0];
		expect(milestone.current).toBe(0);
		expect(milestoneProgress(milestone)).toBe(0);
		expect(milestone.achieved).toEqual({});
	});
	it("records, edits and undoes named completion stages without losing other stage history", async () => {
		jest.useFakeTimers().setSystemTime(new Date("2026-11-15T12:00:00"));
		try {
			const { service } = setup();
			const path = "Goals/Developer.md";
			await service.addMilestone(path, {
				name: "Launch",
				tiers: [],
				stages: [
					{ id: "draft", name: "Draft" },
					{ id: "launch", name: "Launch" },
				],
			});
			expect(milestoneProgress((await service.getGoal(path))!.milestones[1])).toBe(0);
			await service.updateMilestone(path, 1, true, "draft");
			let milestone = (await service.getGoal(path))!.milestones[1];
			expect(milestone.achieved).toEqual({ draft: "2026-11-15" });
			expect(milestoneProgress(milestone)).toBe(0.5);
			expect(isGoalMilestoneComplete(milestone)).toBe(false);
			jest.setSystemTime(new Date("2026-11-16T12:00:00"));
			await service.updateMilestone(path, 1, true);
			await service.updateMilestoneDefinition(path, 1, {
				name: "Ship",
				tiers: [],
				stages: [
					{ id: "draft", name: "First draft" },
					{ id: "launch", name: "Published" },
					{ id: "review", name: "Review" },
				],
			});
			milestone = (await service.getGoal(path))!.milestones[1];
			expect(milestone.name).toBe("Ship");
			expect(milestone.achieved).toEqual({ draft: "2026-11-15", launch: "2026-11-16" });
			expect(milestone.hours_at).toEqual({ draft: 0, launch: 0 });
			milestone.stages![0].name = "Do not leak mutation";
			expect((await service.getGoal(path))!.milestones[1].stages![0].name).toBe(
				"First draft"
			);
			await service.updateMilestone(path, 1, true, "review");
			expect(isGoalMilestoneComplete((await service.getGoal(path))!.milestones[1])).toBe(
				true
			);
			await service.undoMilestoneAchievement(path, 1, "launch");
			milestone = (await service.getGoal(path))!.milestones[1];
			expect(milestone.achieved).toEqual({ draft: "2026-11-15", review: "2026-11-16" });
			expect(isGoalMilestoneComplete(milestone)).toBe(false);
		} finally {
			jest.useRealTimers();
		}
	});

	it("adopts a legacy completed milestone as the first stage without fabricating dates for new stages", async () => {
		const { service } = setup();
		const path = "Goals/Developer.md";
		await service.addMilestone(path, { name: "Legacy", tiers: [] });
		await service.updateMilestone(path, 1, true);
		const original = (await service.getGoal(path))!.milestones[1];
		expect(typeof original.achieved).toBe("string");
		await service.updateMilestoneDefinition(path, 1, {
			name: "Extended",
			tiers: [],
			stages: [
				{ id: "complete", name: "Original stage" },
				{ id: "followup", name: "Follow up" },
			],
		});
		let milestone = (await service.getGoal(path))!.milestones[1];
		expect(milestone.achieved).toEqual({ complete: original.achieved });
		expect(milestoneProgress(milestone)).toBe(0.5);
		await service.updateMilestone(path, 1, true);
		milestone = (await service.getGoal(path))!.milestones[1];
		expect(isGoalMilestoneComplete(milestone)).toBe(true);
		await service.updateMilestoneDefinition(path, 1, {
			name: "Extended",
			tiers: [],
			stages: [{ id: "followup", name: "Follow up" }],
		});
		milestone = (await service.getGoal(path))!.milestones[1];
		expect(milestone.achieved).toEqual({ followup: expect.any(String) });
		expect(milestone.hours_at).toEqual({ followup: 0 });
	});

	it("preserves numeric values and retained tier dates when editing while not completing newly lowered tiers", async () => {
		const { service } = setup();
		const path = "Goals/Developer.md";
		await service.updateMilestone(path, 0, 12);
		const original = (await service.getGoal(path))!.milestones[0];
		await service.updateMilestoneDefinition(path, 0, {
			name: "Revenue",
			tiers: [10, 50, 200],
			unit: "美元",
		});
		let milestone = (await service.getGoal(path))!.milestones[0];
		expect(milestone).toMatchObject({
			name: "Revenue",
			unit: "美元",
			tiers: [10, 50, 200],
			current: 12,
			achieved: original.achieved,
			progressHistory: original.progressHistory,
		});
		await service.updateMilestoneDefinition(path, 0, { name: "Revenue", tiers: [5, 50] });
		milestone = (await service.getGoal(path))!.milestones[0];
		expect(milestone.achieved).toEqual({});
		expect(milestone.hours_at).toEqual({});
		expect(milestone.current).toBe(12);
	});

	it("rejects invalid edits and type changes without modifying goal notes", async () => {
		const { app, service } = setup();
		const path = "Goals/Developer.md";
		const file = app.vault.getFileByPath(path)!;
		const before = await app.vault.read(file);
		for (const draft of [
			{ name: "", tiers: [10] },
			{ name: "Invalid", tiers: [100, 10] },
			{ name: "Invalid", tiers: [NaN] },
			{ name: "Type switch", tiers: [], stages: [{ id: "s1", name: "Done" }] },
			{ name: "Invalid", tiers: [], stages: [{ id: "s1", name: "" }] },
		])
			await expect(service.updateMilestoneDefinition(path, 0, draft)).rejects.toThrow();
		expect(await app.vault.read(file)).toBe(before);
	});
	it("reads only the configured folder and switches away from cached old goals", async () => {
		const { app, plugin, service } = setup();
		await service.listGoals();
		await app.vault.create(
			"Custom/Goals/New.md",
			content.replace("name: Developer", "name: New")
		);
		await app.vault.create("Custom/Goals-extra/Other.md", content);
		plugin.settings.goalsFolder = " Custom\\Goals/ ";
		expect((await service.listGoals()).map((goal) => goal.name)).toEqual(["New"]);
		expect(await service.getGoal("Goals/Developer.md")).toBeNull();
		expect(service.isGoalPath("Custom/Goals-extra/Other.md")).toBe(false);
	});

	it.each([undefined, "", "Custom/Nested/Goals/"])(
		"creates parent and child goal files in the selected folder: %s",
		async (folder) => {
			const { app, plugin, service } = setup();
			plugin.settings.goalsFolder = folder as string;
			const createFolder = jest.spyOn(app.vault, "createFolder");
			const goals = await service.createGoalGroup({
				name: "Parent",
				mode: "floor",
				period: "weekly",
				split: true,
				why: "Practice",
				items: [{ name: "Child", target: 5, scope: ["practice"], milestones: [] }],
				parentMilestones: [],
			});
			const expected = folder ? "Custom/Nested/Goals" : "TASKquence/Tasks/Goals";
			expect(goals.map((goal) => goal.path)).toEqual([
				`${expected}/Parent.md`,
				`${expected}/Child.md`,
			]);
			expect(createFolder.mock.calls.map(([path]) => path)).toEqual(
				expected.split("/").map((_, index, parts) => parts.slice(0, index + 1).join("/"))
			);
			expect(await service.listGoals()).toHaveLength(2);
		}
	);

	it("includes time and target settings from before the goal was created", async () => {
		const { service } = setup();
		const tasks = [
			{
				path: "Tasks/dev.md",
				title: "Develop",
				tags: ["work/dev"],
				timeEntries: [{ startTime: "2026-09-08T09:00:00", endTime: "2026-09-08T11:00:00" }],
			},
		] as TaskInfo[];
		const result = await service.getProgress(tasks, "week", new Date(2026, 8, 8));
		expect(result.goals).toHaveLength(1);
		expect(result.progress[0].actual).toBe(2);
		expect(result.progress[0].target).toBe(10);
	});
	it.each(["2026-10-29T00:30:00", "2026-10-29T12:00:00", "2026-10-29T23:30:00"])(
		"immediately reflects saved targets in the current week at %s and preserves past weeks",
		async (time) => {
			jest.useFakeTimers().setSystemTime(new Date(time));
			try {
				const { service } = setup();
				await service.updateGoalSettings("Goals/Developer.md", { target: 5 });
				const current = await service.getProgress([], "week");
				expect(current.goals[0].target).toBe("5h");
				expect(current.goals[0].settingsHistory).toContainEqual({
					date: "2026-10-29",
					target: 5,
				});
				expect(current.progress[0].target).toBe(5);
				const previous = await service.getProgress(
					[],
					"week",
					new Date("2026-10-20T12:00:00")
				);
				expect(previous.progress[0].target).toBe(10);
				await service.updateGoalSettings("Goals/Developer.md", { target: 6 });
				const revised = await service.getProgress([], "week");
				expect(revised.progress[0].target).toBe(6);
				expect(revised.goals[0].settingsHistory).toHaveLength(2);
			} finally {
				jest.useRealTimers();
			}
		}
	);

	it("rolls adopted historical tag data up to its new parent goal", async () => {
		const { service } = setup();
		const child = (await service.listGoals())[0];
		const parent = {
			...child,
			name: "Parent",
			path: "Goals/Parent.md",
			mode: undefined,
			target: undefined,
			scope: [],
			children: [child.name],
		};
		jest.spyOn(service, "listGoals").mockResolvedValue([
			parent,
			{ ...child, parent: parent.name },
		]);
		const tasks = [
			{
				path: "Tasks/dev.md",
				title: "Develop",
				tags: ["work/dev/subtag"],
				timeEntries: [{ startTime: "2026-09-08T09:00:00", endTime: "2026-09-08T11:00:00" }],
			},
		] as TaskInfo[];
		const result = await service.getProgress(tasks, "week", new Date(2026, 8, 8));
		expect(result.progress[0].actual).toBe(2);
		expect(result.progress[1].actual).toBe(2);
	});
	it("reuses unchanged files without exposing mutable cached milestone records", async () => {
		const { app, service } = setup();
		const read = jest.spyOn(app.vault, "cachedRead");
		const goals = await service.listGoals();
		goals[0].milestones[0].current = 99;
		const next = await service.listGoals();
		expect(read).toHaveBeenCalledTimes(1);
		expect(next[0].milestones[0].current).toBe(0);
		expect(next[0].why).toBe("Keep creating");
	});
	it("rereads a changed file instead of using a stale goal snapshot", async () => {
		const { app, service } = setup();
		await service.listGoals();
		const file = app.vault.getFileByPath("Goals/Developer.md")!;
		await app.vault.modify(file, content.replace("10h", "20h"));
		file.stat.mtime += 1;
		expect((await service.listGoals())[0].target).toBe("20h");
	});
	it("changes only a milestone unit without rewriting its recorded values", async () => {
		const { service } = setup();
		await service.updateMilestoneUnit("Goals/Developer.md", 0, "美元");
		const milestone = (await service.getGoal("Goals/Developer.md"))!.milestones[0];
		expect(milestone.unit).toBe("美元");
		expect(milestone.current).toBe(0);
		expect(milestone.tiers).toEqual([10, 100]);
	});

	it("records one progress snapshot per day and preserves a legacy prior value", async () => {
		jest.useFakeTimers().setSystemTime(new Date("2026-09-21T12:00:00"));
		try {
			const legacyContent = content
				.replace("current: 0", "current: 5")
				.replace("    hours_at: {}", "    hours_at: {}\n    updated_at: 2026-09-17");
			const { service } = setup(legacyContent);
			await service.updateMilestone("Goals/Developer.md", 0, 12);
			await service.updateMilestone("Goals/Developer.md", 0, 15);
			const milestone = (await service.getGoal("Goals/Developer.md"))!.milestones[0];
			expect(milestone.progressHistory).toEqual([
				{ date: "2026-09-17", value: 5 },
				{ date: "2026-09-21", value: 15 },
			]);
			expect(milestone.achieved).toEqual({ "10": "2026-09-21" });
		} finally {
			jest.useRealTimers();
		}
	});
});
