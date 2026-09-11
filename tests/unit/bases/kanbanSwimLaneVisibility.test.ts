import {
	buildSwimLaneVisibilityToggleOptions,
	filterVisibleSwimLanes,
	getSwimLaneVisibilityKey,
	isSwimLaneVisible,
	syncAvailableSwimLanes,
} from "../../../src/bases/kanbanSwimLaneVisibility";

describe("Kanban swim lane visibility", () => {
	it("preserves the lanes visible when opt-in visibility is first initialized", () => {
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
		expect(
			buildSwimLaneVisibilityToggleOptions(config).every((option) => option.default === true)
		).toBe(true);
	});

	it("shows newly discovered lanes while retaining explicit visibility choices", () => {
		const values = new Map<string, unknown>();
		const config = {
			get: (key: string) => values.get(key),
			set: (key: string, value: unknown) => values.set(key, value),
		};

		syncAvailableSwimLanes(config, ["创作", "None"]);
		expect(isSwimLaneVisible(config, "创作")).toBe(true);

		syncAvailableSwimLanes(config, ["创作", "None", "学习/微观经济学"]);
		expect(isSwimLaneVisible(config, "创作")).toBe(true);
		expect(isSwimLaneVisible(config, "学习/微观经济学")).toBe(true);

		values.set(getSwimLaneVisibilityKey("学习/微观经济学"), true);
		expect(isSwimLaneVisible(config, "学习/微观经济学")).toBe(true);
	});

	it("migrates an existing board without re-enabling lanes that were turned off", () => {
		const hiddenKey = getSwimLaneVisibilityKey("None");
		const values = new Map<string, unknown>([
			["availableSwimLanes", JSON.stringify(["创作", "None"])],
			[hiddenKey, false],
		]);
		const config = {
			get: (key: string) => values.get(key),
			set: (key: string, value: unknown) => values.set(key, value),
		};

		syncAvailableSwimLanes(config, ["创作", "None", "学习"]);

		expect(isSwimLaneVisible(config, "创作")).toBe(true);
		expect(isSwimLaneVisible(config, "None")).toBe(false);
		expect(isSwimLaneVisible(config, "学习")).toBe(true);
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
			[getSwimLaneVisibilityKey("项目/产品经理/PartnerShare"), true],
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
