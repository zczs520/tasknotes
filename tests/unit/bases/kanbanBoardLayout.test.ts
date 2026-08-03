import {
	applyKanbanBoardLayout,
	normalizeKanbanBoardLayout,
} from "../../../src/bases/kanbanBoardLayout";

describe("Kanban board layout", () => {
	it("uses a centered fixed width by default", () => {
		const layout = normalizeKanbanBoardLayout(undefined, undefined, undefined);
		const element = document.createElement("div");
		applyKanbanBoardLayout(element, layout);

		expect(layout).toEqual({ fullWidth: false, width: 1200, sideMargin: 0 });
		expect(element.style.width).toBe("calc(100% - 0px)");
		expect(element.style.maxWidth).toBe("1200px");
		expect(element.classList.contains("tn-kanban-layout-frame")).toBe(true);
	});

	it("supports full width with configurable side margins", () => {
		const layout = normalizeKanbanBoardLayout(true, 1600, 32);
		const element = document.createElement("div");
		applyKanbanBoardLayout(element, layout);

		expect(element.style.width).toBe("calc(100% - 64px)");
		expect(element.style.maxWidth).toBe("none");
	});

	it("clamps manually edited configuration values", () => {
		expect(normalizeKanbanBoardLayout(false, 9999, -20)).toEqual({
			fullWidth: false,
			width: 2400,
			sideMargin: 0,
		});
	});
});
