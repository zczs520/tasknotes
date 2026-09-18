import type TaskNotesPlugin from "../../../src/main";
import type { TaskInfo } from "../../../src/types";
import { GoalService } from "../../../src/services/GoalService";
import { createMockApp } from "../../helpers/obsidian-runtime";

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

function setup() {
	const app = createMockApp({ "Goals/Developer.md": content });
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
	it("reads only the configured folder and switches away from cached old goals", async () => {
		const { app, plugin, service } = setup();
		await service.listGoals();
		await app.vault.create("Custom/Goals/New.md", content.replace("name: Developer", "name: New"));
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
				`${expected}/Parent.md`, `${expected}/Child.md`,
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
});
