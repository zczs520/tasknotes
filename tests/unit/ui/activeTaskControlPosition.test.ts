import { clampActiveTaskControlPosition } from "../../../src/ui/activeTaskControlPosition";

describe("active task control position", () => {
	it("keeps a dragged control inside the workspace", () => {
		expect(
			clampActiveTaskControlPosition(
				{ x: 900, y: -20 },
				{ width: 800, height: 600 },
				{ width: 260, height: 50 }
			)
		).toEqual({ x: 532, y: 8 });
	});

	it("keeps the safety margin when the workspace is smaller than the control", () => {
		expect(
			clampActiveTaskControlPosition(
				{ x: 100, y: 100 },
				{ width: 200, height: 40 },
				{ width: 260, height: 50 }
			)
		).toEqual({ x: 8, y: 8 });
	});
});
