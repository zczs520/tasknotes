import { EditorView } from "@codemirror/view";
import { TaskLinkWidget } from "../../../src/editor/TaskLinkWidget";
import type TaskNotesPlugin from "../../../src/main";
import type { TaskInfo } from "../../../src/types";
import { createTaskCard } from "../../../src/ui/TaskCard";

jest.mock("../../../src/ui/TaskCard", () => ({
	createTaskCard: jest.fn(() => document.createElement("span")),
}));

describe("TaskLinkWidget click behavior", () => {
	it("makes an inline task link open the task editor on the first click", () => {
		const task = {
			title: "网盟",
			path: "TaskNotes/网盟.md",
			status: "open",
		} as TaskInfo;
		const plugin = {
			settings: {
				inlineVisibleProperties: ["status", "scheduled"],
			},
			fieldMapper: {
				getMapping: jest.fn(() => ({ status: "status", scheduled: "scheduled" })),
				toUserField: jest.fn((field: string) => field),
			},
		} as unknown as TaskNotesPlugin;
		const widget = new TaskLinkWidget(task, plugin, "[[网盟]]");

		widget.toDOM({ dispatch: jest.fn() } as unknown as EditorView);

		expect(createTaskCard).toHaveBeenCalledWith(
			task,
			plugin,
			expect.any(Array),
			expect.objectContaining({
				layout: "inline",
				openEditOnAnyClick: true,
			})
		);
	});
});
