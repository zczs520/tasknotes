import {
	buildSwimLaneVisibilityToggleOptions,
	filterVisibleSwimLanes,
	getSwimLaneVisibilityKey,
	isSwimLaneVisible,
	syncAvailableSwimLanes,
} from "../../../src/bases/kanbanSwimLaneVisibility";

describe("Kanban swim lane visibility", () => {
	it("exposes only the swim lanes discovered in the current board and defaults them on", () => {
		const values = new Map<string, unknown>();
		const config = {
			get: (key: string) => values.get(key),
			set: (key: string, value: unknown) => values.set(key, value),
		};

		expect(syncAvailableSwimLanes(config, ["项目/产品经理/PartnerShare", "创作", "None"])).toBe(
			true
		);
		expect(
			buildSwimLaneVisibilityToggleOptions(config).map((option) => option.displayName)
		).toEqual(["项目/产品经理/PartnerShare", "创作", "None"]);
		expect(isSwimLaneVisible(config, "创作")).toBe(true);
	});

	it("uses a stable config key and remembers when a swim lane is turned off", () => {
		const values = new Map<string, unknown>();
		const config = { get: (key: string) => values.get(key) };
		const visibilityKey = getSwimLaneVisibilityKey("项目/产品经理/PartnerShare");

		expect(visibilityKey).toBe(getSwimLaneVisibilityKey("项目/产品经理/PartnerShare"));
		expect(visibilityKey).not.toContain("/");
		values.set(visibilityKey, false);
		expect(isSwimLaneVisible(config, "项目/产品经理/PartnerShare")).toBe(false);
	});
	it("filters hidden lanes again after saved ordering recreates an empty lane", () => {
		const values = new Map<string, unknown>([
			[getSwimLaneVisibilityKey("task"), false],
		]);
		const config = { get: (key: string) => values.get(key) };
		const orderedLanes = new Map([
			["项目/产品经理/PartnerShare", { count: 3 }],
			["task", { count: 0 }],
		]);

		expect(Array.from(filterVisibleSwimLanes(config, orderedLanes).keys())).toEqual([
			"项目/产品经理/PartnerShare",
		]);
	});
});
