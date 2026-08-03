import { moveKanbanOrderKey } from "../../../src/bases/kanbanGrouping";

describe("moveKanbanOrderKey", () => {
	const order = ["None", "task", "creative", "project"];

	it("moves a swim lane before the drop target", () => {
		expect(moveKanbanOrderKey(order, "project", "task", "before")).toEqual([
			"None",
			"project",
			"task",
			"creative",
		]);
	});

	it("moves a swim lane after the drop target", () => {
		expect(moveKanbanOrderKey(order, "None", "creative", "after")).toEqual([
			"task",
			"creative",
			"None",
			"project",
		]);
	});

	it("does not mutate the current order or accept invalid moves", () => {
		expect(moveKanbanOrderKey(order, "task", "task", "before")).toBeNull();
		expect(moveKanbanOrderKey(order, "missing", "task", "before")).toBeNull();
		expect(order).toEqual(["None", "task", "creative", "project"]);
	});
});
