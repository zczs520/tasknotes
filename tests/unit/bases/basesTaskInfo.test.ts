import {
	createTaskInfoFromBasesData,
	identifyTaskNotesFromBasesData,
} from "../../../src/bases/helpers";
import type TaskNotesPlugin from "../../../src/main";
import { FieldMapper } from "../../../src/services/FieldMapper";
import { DEFAULT_FIELD_MAPPING } from "../../../src/settings/defaults";

function createPlugin(sortOrderField = "sort_order") {
	const fieldMapper = new FieldMapper({
		...DEFAULT_FIELD_MAPPING,
		sortOrder: sortOrderField,
	});

	return {
		fieldMapper,
		settings: {
			defaultTaskStatus: "open",
			storeTitleInFilename: false,
		},
		dependencyCache: undefined,
		cacheManager: {
			getCachedTaskInfoSync: jest.fn(),
		},
	};
}

describe("Bases TaskInfo assembly", () => {
	it("keeps the Bases status and stopped timer when the task cache still contains the active task", () => {
		const plugin = createPlugin();
		const path = "Tasks/Stopped.md";
		plugin.cacheManager.getCachedTaskInfoSync.mockReturnValue({
			path,
			title: "Stopped",
			status: "in-progress",
			priority: "normal",
			archived: false,
			timeEntries: [{ startTime: "2026-11-16T09:00:00Z" }],
			recurrence_parent: "[[Tasks/Parent]]",
		});
		const timeEntries = [
			{ startTime: "2026-11-16T09:00:00Z", endTime: "2026-11-16T09:30:00Z" },
		];
		const task = createTaskInfoFromBasesData(
			{ path, properties: { status: "open", timeEntries } },
			plugin as unknown as TaskNotesPlugin
		);
		expect(task).toMatchObject({
			status: "open",
			timeEntries,
			totalTrackedTime: 30,
			recurrence_parent: "[[Tasks/Parent]]",
		});
	});

	it("uses the configured status field from Bases even with an older cached status", () => {
		const plugin = createPlugin();
		plugin.fieldMapper.updateMapping({ ...DEFAULT_FIELD_MAPPING, status: "任务状态" });
		plugin.cacheManager.getCachedTaskInfoSync.mockReturnValue({
			path: "Tasks/task.md",
			status: "in-progress",
		});
		const task = createTaskInfoFromBasesData(
			{ path: "Tasks/task.md", properties: { 任务状态: "open" } },
			plugin as unknown as TaskNotesPlugin
		);
		expect(task?.status).toBe("open");
	});

	it("preserves mapped manual-order values on TaskInfo", () => {
		const task = createTaskInfoFromBasesData(
			{
				path: "Tasks/Manual.md",
				name: "Manual",
				properties: {
					title: "Manual",
					status: "open",
					sort_order: "0|hzzzzz:",
				},
			},
			createPlugin() as unknown as TaskNotesPlugin
		);

		expect(task?.sortOrder).toBe("0|hzzzzz:");
		expect(task?.customProperties?.sortOrder).toBeUndefined();
	});

	it("preserves materialized occurrence fields on TaskInfo", () => {
		const task = createTaskInfoFromBasesData(
			{
				path: "Tasks/Occurrence.md",
				name: "Occurrence",
				properties: {
					title: "Occurrence",
					status: "open",
					scheduled: "2026-06-05T10:30",
					recurrence_parent: "[[Tasks/Parent]]",
					occurrence_date: "2026-06-05",
				},
			},
			createPlugin() as unknown as TaskNotesPlugin
		);

		expect(task?.recurrence_parent).toBe("[[Tasks/Parent]]");
		expect(task?.occurrence_date).toBe("2026-06-05");
		expect(task?.customProperties?.recurrence_parent).toBeUndefined();
		expect(task?.customProperties?.occurrence_date).toBeUndefined();
	});

	it("enriches hidden materialized occurrence fields from the TaskNotes cache", async () => {
		const plugin = createPlugin() as unknown as TaskNotesPlugin;
		(plugin.cacheManager.getCachedTaskInfoSync as jest.Mock).mockReturnValue({
			title: "Occurrence",
			status: "open",
			priority: "normal",
			path: "Tasks/Occurrence.md",
			archived: false,
			scheduled: "2026-06-05T10:30",
			recurrence_parent: "[[Tasks/Parent]]",
			occurrence_date: "2026-06-05",
			customProperties: {
				cachedOnly: true,
			},
		});

		const tasks = await identifyTaskNotesFromBasesData(
			[
				{
					path: "Tasks/Occurrence.md",
					name: "Occurrence",
					properties: {
						title: "Occurrence",
						status: "open",
						scheduled: "2026-06-05T10:30",
						"file.path": "Tasks/Occurrence.md",
					},
					basesData: { source: "bases-entry" },
				},
			],
			plugin
		);

		expect(tasks).toHaveLength(1);
		expect(tasks[0].recurrence_parent).toBe("[[Tasks/Parent]]");
		expect(tasks[0].occurrence_date).toBe("2026-06-05");
		expect(tasks[0].basesData).toEqual({ source: "bases-entry" });
		expect(tasks[0].customProperties).toMatchObject({
			cachedOnly: true,
			"file.path": "Tasks/Occurrence.md",
		});
	});
});
