import type TaskNotesPlugin from "../../../src/main";
import type { TaskInfo } from "../../../src/types";
import {
	enhanceTaskMetadataProperties,
	getTaskMetadataPropertySummary,
	removeTaskMetadataPropertyEnhancements,
} from "../../../src/editor/TaskMetadataPropertyEnhancer";

function createTask(overrides: Partial<TaskInfo> = {}): TaskInfo {
	return {
		title: "Task",
		status: "open",
		priority: "normal",
		path: "Tasks/task.md",
		archived: false,
		dateCreated: "2026-07-28T16:33:05.793+08:00",
		dateModified: "2026-07-28T18:27:32.239+08:00",
		...overrides,
	};
}

function createPlugin(): TaskNotesPlugin {
	const plugin = {
		fieldMapper: {
			toUserField: jest.fn((field: string) => field),
		},
		i18n: {
			translate: jest.fn((key: string, vars?: Record<string, string | number>) => {
				if (key === "ui.taskCard.timeEntriesActiveSummary") {
					return `${vars?.count} sessions · tracking now · ${vars?.duration}`;
				}
				if (key === "ui.taskCard.timeEntriesSummary") {
					return `${vars?.count} sessions · ${vars?.duration}`;
				}
				if (key === "ui.taskCard.editTimeEntriesTooltip") return "Edit time entries";
				return key;
			}),
		},
		cacheManager: {
			getCachedTaskInfoSync: jest.fn(() => null),
		},
		openTimeEntryEditor: jest.fn(),
	};
	return plugin as unknown as TaskNotesPlugin;
}

function createPropertyRow(propertyKey: string): HTMLElement {
	const row = document.createElement("div");
	row.className = "metadata-property";
	row.dataset.propertyKey = propertyKey;
	const value = row.createDiv({ cls: "metadata-property-value" });
	value.createDiv({ cls: "metadata-input-longtext", text: "raw value" });
	document.body.appendChild(row);
	return row;
}

describe("TaskMetadataPropertyEnhancer", () => {
	beforeEach(() => {
		document.body.innerHTML = "";
	});

	it("formats offset timestamps for local display without changing the stored value", () => {
		const plugin = createPlugin();
		const task = createTask();
		const summary = getTaskMetadataPropertySummary("dateCreated", task, plugin);

		const localDate = new Date("2026-07-28T16:33:05.793+08:00");
		const expected = `${localDate.getFullYear()}-${String(localDate.getMonth() + 1).padStart(2, "0")}-${String(localDate.getDate()).padStart(2, "0")} ${String(localDate.getHours()).padStart(2, "0")}:${String(localDate.getMinutes()).padStart(2, "0")}`;
		expect(summary?.text).toBe(expected);
		expect(summary?.title).toBe("2026-07-28T16:33:05.793+08:00");
	});

	it("summarizes active time entries and opens the dedicated editor", () => {
		const plugin = createPlugin();
		const task = createTask({
			timeEntries: [{ startTime: "2026-07-28T10:27:32.239Z", description: "Work session" }],
		});
		createPropertyRow("timeEntries");

		enhanceTaskMetadataProperties(document, task, plugin);

		const summary = document.querySelector<HTMLElement>(".tasknotes-system-property__summary");
		expect(summary?.textContent).toBe("1 sessions · tracking now · 0m");
		expect(summary?.getAttribute("role")).toBe("button");
		summary?.click();
		expect(plugin.openTimeEntryEditor).toHaveBeenCalledWith(task);
	});

	it("restores the native property DOM when enhancements are removed", () => {
		const plugin = createPlugin();
		const row = createPropertyRow("dateModified");
		enhanceTaskMetadataProperties(document, createTask(), plugin);

		removeTaskMetadataPropertyEnhancements(document);

		expect(row.classList.contains("tasknotes-system-property")).toBe(false);
		expect(row.querySelector(".tasknotes-system-property__summary")).toBeNull();
	});
});
