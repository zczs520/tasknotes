import { parse } from "yaml";
import { updateGeneratedTaskIdentity } from "../../../src/bootstrap/taskIdentityMigration";
import { buildExampleTaskNotes } from "../../../src/bootstrap/exampleTaskNotes";

describe("legacy task filter migration", () => {
	it.each(["open-kanban-view", "open-statistics"])(
		"repairs %s without a header comment",
		(command) => {
			const original =
				'filters:\n  and:\n    - file.hasTag("task")\n    - file.hasTag("work")\nviews:\n  - type: tasknotesKanban\n    timeFilterPreset: last-week\n    swimLane: note.tags\n';
			const result = updateGeneratedTaskIdentity(command, original);
			expect(parse(result).filters.and).toEqual([
				'note["taskType"] == "task"',
				'file.hasTag("work")',
			]);
			expect(parse(result).views).toEqual(parse(original).views);
			expect(updateGeneratedTaskIdentity(command, result)).toBe(result);
		}
	);
	it("leaves unrelated views and malformed files unchanged", () => {
		const original = 'filters:\n  and:\n    - file.hasTag("task")\n';
		expect(updateGeneratedTaskIdentity("open-tasks-view", original)).toBe(original);
		expect(updateGeneratedTaskIdentity("open-kanban-view", "filters: [")).toBe("filters: [");
	});
});

describe("example tasks", () => {
	it("creates six bilingual categories with closed daily, weekly and monthly coverage", () => {
		const notes = buildExampleTaskNotes({
			status: "todo",
			completedStatus: "finished",
			statusField: "state",
			priorityField: "priority",
			scheduledField: "plan",
			timeEntriesField: "sessions",
			date: new Date(2026, 8, 11, 15),
		});
		const tasks = notes.filter((note) => note.content.startsWith("---"));
		expect(tasks).toHaveLength(6);
		expect(tasks.every((note) => /\/示例 Example 0[1-6] - /.test(note.path))).toBe(true);
		const properties = tasks.map((note) => parse(note.content.split("---")[1]));
		expect(
			properties.every(
				(task) =>
					task.taskType === "task" && task.taskquenceExample && task.plan === "2026-09-11"
			)
		).toBe(true);
		expect(new Set(properties.flatMap((task) => task.tags))).toEqual(
			new Set([
				"工作-Work",
				"学习-Study",
				"创作-Creation",
				"生活/健身-Fitness",
				"生活/家务-Home",
				"生活/娱乐-Leisure",
			])
		);
		const sessions = properties.flatMap((task) => task.sessions ?? []);
		expect(sessions.length).toBeGreaterThan(250);
		expect(sessions.every((session) => session.startTime && session.endTime)).toBe(true);
		expect(
			sessions.every(
				(session) =>
					new Date(session.endTime).getTime() <= new Date(2026, 8, 11, 15).getTime()
			)
		).toBe(true);
		const localDay = (value: string) => {
			const date = new Date(value);
			return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(
				date.getDate()
			).padStart(2, "0")}`;
		};
		const coveredDays = new Set(sessions.map((session) => localDay(session.startTime)));
		for (
			const date = new Date(2026, 0, 1);
			date <= new Date(2026, 8, 11);
			date.setDate(date.getDate() + 1)
		) {
			expect(coveredDays).toContain(localDay(date.toISOString()));
		}
		expect(
			new Set(sessions.map((session) => new Date(session.startTime).getMonth() + 1))
		).toEqual(new Set([1, 2, 3, 4, 5, 6, 7, 8, 9]));
		expect(
			sessions.filter((session) => localDay(session.startTime) === "2026-09-11")
		).toHaveLength(6);
		expect(
			sessions
				.filter((session) => localDay(session.startTime) === "2026-09-11")
				.every((session) => session.description.includes("今日示例 / Today's example"))
		).toBe(true);
		expect(properties[5].state).toBe("finished");
		expect(notes.filter((note) => !note.content.startsWith("---"))).toHaveLength(1);
	});
});
