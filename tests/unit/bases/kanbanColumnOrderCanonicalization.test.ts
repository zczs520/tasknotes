import { applyKanbanColumnOrder } from "../../../src/bases/kanbanGrouping";

describe("Kanban saved column order canonicalization", () => {
	it("does not render duplicate status columns when the saved key uses different casing", () => {
		const order = applyKanbanColumnOrder({
			groupBy: "note.status",
			actualKeys: ["Open", "in-progress", "done"],
			columnOrders: {
				"note.status": ["open", "in-progress", "done"],
			},
			hideEmptyColumns: false,
			pinnedColumns: [],
			isPriorityField: () => false,
			isStatusField: () => true,
			getPriorityWeight: () => 0,
			findStatusConfig: () => undefined,
			canonicalizeKey: (key) => (key === "open" ? "Open" : key),
		});

		expect(order).toEqual(["Open", "in-progress", "done"]);
	});
});
