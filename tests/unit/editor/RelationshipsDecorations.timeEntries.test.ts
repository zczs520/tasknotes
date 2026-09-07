import type TaskNotesPlugin from "../../../src/main";
import type { TaskInfo } from "../../../src/types";
import {
	getTaskNoteTimeEntryDurationMs,
	getTaskNoteTotalTrackedDurationMs,
	refreshLiveDurations,
	createRelationshipsWidget,
	refreshRelationshipsWidget,
} from "../../../src/editor/RelationshipsDecorations";
import { formatTimeStatisticsDuration } from "../../../src/utils/timeStatistics";

describe("task note footer time entries", () => {
	const now = new Date("2026-09-04T12:00:00.000Z");

	it("derives completed and active durations from timestamps", () => {
		expect(
			getTaskNoteTimeEntryDurationMs(
				{
					startTime: "2026-09-04T10:00:00.000Z",
					endTime: "2026-09-04T10:25:00.000Z",
				},
				now
			)
		).toBe(25 * 60_000);
		expect(getTaskNoteTimeEntryDurationMs({ startTime: "2026-09-04T11:40:00.000Z" }, now)).toBe(
			20 * 60_000
		);
	});

	it("sums sessions and safely ignores malformed timestamps", () => {
		expect(
			getTaskNoteTotalTrackedDurationMs(
				[
					{
						startTime: "2026-09-04T10:00:00.000Z",
						endTime: "2026-09-04T10:25:00.000Z",
					},
					{ startTime: "2026-09-04T11:40:00.000Z" },
					{ startTime: "not-a-date" },
				],
				now
			)
		).toBe(45 * 60_000);
	});

	it("keeps completed rows fixed while refreshing the active entry and total", () => {
		const container = document.createElement("div");
		const completed = document.createElement("div");
		completed.dataset.tasknotesEntryStart = "2026-09-04T11:40:00.000Z";
		completed.dataset.tasknotesEntryEnd = "2026-09-04T11:48:00.000Z";
		container.appendChild(completed);
		const active = document.createElement("div");
		active.dataset.tasknotesEntryStart = "2026-09-04T11:59:00.000Z";
		active.dataset.tasknotesEntryEnd = "";
		container.appendChild(active);
		const total = document.createElement("div");
		total.dataset.tasknotesTimeTotal = "true";
		container.appendChild(total);

		refreshLiveDurations(container, true, now);

		expect(completed.textContent).toBe(formatTimeStatisticsDuration(8 * 60_000, true));
		expect(active.textContent).toBe(formatTimeStatisticsDuration(60_000, true));
		expect(total.textContent).toBe(formatTimeStatisticsDuration(9 * 60_000, true));
	});
});

describe("task note footer stability", () => {
	it("preserves the Base and timer while typing, then updates only the timer when stopped", async () => {
		jest.useFakeTimers();
		jest.setSystemTime(new Date("2026-09-04T12:00:00Z"));
		let task = {
			path: "task.md",
			timeEntries: [{ startTime: "2026-09-04T11:59:00Z" }],
		} as TaskInfo;
		const plugin = {
			i18n: { getCurrentLocale: () => "zh" },
			settings: { commandFileMapping: {} },
			cacheManager: { getCachedTaskInfoSync: () => task },
		} as unknown as TaskNotesPlugin;
		const widget = await createRelationshipsWidget(plugin, task.path);
		const base = widget.querySelector(".relationships__bases-container");
		const timer = widget.querySelector(".tasknotes-note-footer__time-card");
		const initialText = timer?.textContent;
		try {
			jest.advanceTimersByTime(120_000);
			task = {
				...task,
				title: "Edited title",
				timeEntries: task.timeEntries?.map((entry) => ({ ...entry })),
			};
			expect(refreshRelationshipsWidget(widget, plugin, task.path)).toBe(true);
			expect(widget.querySelector(".tasknotes-note-footer__time-card")).toBe(timer);
			expect(timer?.textContent).toBe(initialText);
			expect(jest.getTimerCount()).toBe(0);
			task = {
				...task,
				timeEntries: [
					{ startTime: "2026-09-04T11:59:00Z", endTime: "2026-09-04T12:02:00Z" },
				],
			};
			expect(refreshRelationshipsWidget(widget, plugin, task.path)).toBe(true);
			expect(widget.querySelector(".tasknotes-note-footer__time-card")).not.toBe(timer);
			expect(
				widget.querySelector(".tasknotes-note-footer__entry-duration")?.textContent
			).toBe(formatTimeStatisticsDuration(180_000, true));
			expect(widget.querySelector(".is-active")).toBeNull();
			expect(widget.querySelector(".relationships__bases-container")).toBe(base);
			expect(refreshRelationshipsWidget(widget, plugin, "another.md")).toBe(false);
		} finally {
			widget.component?.unload();
			jest.useRealTimers();
		}
	});
});
