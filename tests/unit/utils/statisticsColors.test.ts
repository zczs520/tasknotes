import { getStatisticsColor } from "../../../src/utils/statisticsColors";

describe("statistics identity colors", () => {
	it("does not repeat colors for tags or goals, even beyond the initial palette", () => {
		const colors = Array.from({ length: 100 }, (_, index) => [
			getStatisticsColor("tag", `tag-${index}`),
			getStatisticsColor("goal", `goal-${index}.md`),
		]).flat();
		expect(new Set(colors).size).toBe(200);
	});
	it("retains allocated colors across different request orders and new identities", () => {
		const original = getStatisticsColor("tag", "项目/产品经理/PartnerShare");
		getStatisticsColor("tag", "事业/自媒体");
		getStatisticsColor("goal", "谋生.md");
		expect(getStatisticsColor("tag", "项目/产品经理/PartnerShare")).toBe(original);
	});
	it("normalizes tag markers and distinguishes tag and goal identities", () => {
		expect(getStatisticsColor("tag", " #开发 ")).toBe(getStatisticsColor("tag", "开发"));
		expect(getStatisticsColor("tag", "开发")).not.toBe(getStatisticsColor("goal", "开发"));
		expect(getStatisticsColor("tag", null)).toBe("#7b8794");
	});
});
