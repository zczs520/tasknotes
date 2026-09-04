import {
	getTaskNoteTimeEntryDurationMs,
	getTaskNoteTotalTrackedDurationMs,
	refreshLiveDurations,
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
