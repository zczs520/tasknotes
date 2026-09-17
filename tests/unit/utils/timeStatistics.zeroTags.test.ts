import { buildTagTimeStatistics } from "../../../src/utils/timeStatistics";
import type { TimeStatisticsSegment } from "../../../src/utils/timeStatistics";

describe("tag statistics including zero-investment tags", () => {
	it("keeps unique tags from tasks when this period has no records", () => {
		expect(
			buildTagTimeStatistics(
				[],
				[{ tags: ["事业/开发", "事业/写作"] }, { tags: ["事业/开发"] }]
			)
		).toEqual([
			{ tag: "事业/开发", durationMs: 0, taskPaths: [] },
			{ tag: "事业/写作", durationMs: 0, taskPaths: [] },
		]);
	});
	it("sorts recorded tags first without changing their duration or task attribution", () => {
		const segment: TimeStatisticsSegment = {
			taskPath: "a.md",
			taskTitle: "开发",
			tags: ["事业/开发"],
			start: new Date(2026, 8, 16, 10),
			end: new Date(2026, 8, 16, 11),
			durationMs: 3_600_000,
			sessionKey: "a:0",
			isActive: false,
		};
		expect(buildTagTimeStatistics([segment], [{ tags: ["事业/开发", "事业/写作"] }])).toEqual([
			{ tag: "事业/开发", durationMs: 3_600_000, taskPaths: ["a.md"] },
			{ tag: "事业/写作", durationMs: 0, taskPaths: [] },
		]);
	});
});
