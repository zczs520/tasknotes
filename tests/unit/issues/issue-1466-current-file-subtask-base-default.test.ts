/**
 * Regression test for issue #1466.
 *
 * Relationships/Subtasks Bases use filters like:
 *   list(note.projects).contains(this.file.asLink())
 *
 * When users create a new task from that embedded Base, TaskNotes should prefill
 * the project with the current note link so the new task is a subtask of that note.
 */

jest.mock("../../../src/modals/TaskCreationModal", () => ({
	TaskCreationModal: jest.fn().mockImplementation(
		(_app: unknown, _plugin: unknown, options: unknown) => ({
			open: jest.fn(),
			options,
		})
	),
}));

import { BasesViewBase } from "../../../src/bases/BasesViewBase";
import { TaskCreationModal } from "../../../src/modals/TaskCreationModal";
import type { TaskInfo } from "../../../src/types";
import { TFile } from "obsidian";

class TestBasesView extends BasesViewBase {
	type = "tasknotesTest";

	render(): void {
		// No-op for this focused creation-defaults test.
	}

	renderError(): void {
		// No-op for this focused creation-defaults test.
	}

	protected async handleTaskUpdate(_task: TaskInfo): Promise<void> {
		// No-op for this focused creation-defaults test.
	}
}

function createMockPlugin(activeFile: { path: string; basename: string; extension: string } | null) {
	return {
		app: {
			workspace: {
				getActiveFile: () => activeFile,
			},
			fileManager: {
				generateMarkdownLink: (file: { basename: string }) => `[[${file.basename}]]`,
			},
		},
		fieldMapper: {
			toUserField: (field: string) => field,
		},
		i18n: {
			translate: (key: string) => (key === "common.new" ? "New" : key),
		},
		settings: {
			taskTag: "task",
			userFields: [],
		},
	} as any;
}

describe("Issue #1466: current-file subtask Base creation defaults", () => {
	beforeEach(() => {
		document.body.innerHTML = "";
		jest.clearAllMocks();
	});

	it("prefills the project from this.file.asLink() filters", async () => {
		const container = document.createElement("div");
		document.body.appendChild(container);

		const view = new TestBasesView(
			{},
			container,
			createMockPlugin({
				path: "Projects/Alpha.md",
				basename: "Alpha",
				extension: "md",
			})
		);
		(view as any).config = {
			filters: {
				conjunction: "and",
				filters: [
					{ rule: { text: 'file.hasTag("task")' } },
					{ rule: { text: "list(note.projects).contains(this.file.asLink())" } },
				],
			},
		};

		await view.createFileForView("New Task");

		expect(TaskCreationModal).toHaveBeenCalledWith(
			expect.anything(),
			expect.anything(),
			expect.objectContaining({
				prePopulatedValues: expect.objectContaining({
					projects: ["[[Alpha]]"],
				}),
			})
		);
	});

	it("does not use the open .base file itself as a project default", async () => {
		const container = document.createElement("div");
		document.body.appendChild(container);

		const view = new TestBasesView(
			{},
			container,
			createMockPlugin({
				path: "TaskNotes/Views/relationships.base",
				basename: "relationships",
				extension: "base",
			})
		);
		(view as any).config = {
			filters: {
				conjunction: "and",
				filters: [
					{ rule: { text: 'file.hasTag("task")' } },
					{ rule: { text: "list(note.projects).contains(this.file.asLink())" } },
				],
			},
		};

		await view.createFileForView("New Task");

		expect(TaskCreationModal).toHaveBeenCalledWith(
			expect.anything(),
			expect.anything(),
			expect.objectContaining({
				prePopulatedValues: {},
			})
		);
	});

	it("uses the relationships host task as parent and inherits its tags", async () => {
		const relationshipWidget = document.createElement("div");
		relationshipWidget.className = "tasknotes-relationships-widget";
		relationshipWidget.dataset.relationshipSourcePath = "Tasks/Alpha.md";
		const container = document.createElement("div");
		relationshipWidget.appendChild(container);
		document.body.appendChild(relationshipWidget);

		const parentFile = new TFile("Tasks/Alpha.md");
		const parentTask = {
			title: "Alpha",
			status: "open",
			priority: "normal",
			path: parentFile.path,
			archived: false,
			projects: ["[[Projects/Roadmap]]"],
			tags: ["task", "project-a", "urgent"],
			contexts: [],
		} satisfies TaskInfo;
		const plugin = createMockPlugin(null) as any;
		plugin.app.vault = {
			getAbstractFileByPath: jest.fn(() => parentFile),
		};
		plugin.app.metadataCache = {
			fileToLinktext: jest.fn((file: TFile) => file.basename),
			getFirstLinkpathDest: jest.fn(() => null),
		};
		plugin.app.fileManager.generateMarkdownLink = jest.fn(
			(file: TFile) => `[[${file.basename}]]`
		);
		plugin.cacheManager = {
			getTaskInfo: jest.fn(async () => parentTask),
		};
		plugin.settings = {
			...plugin.settings,
			taskIdentificationMethod: "tag",
			useFrontmatterMarkdownLinks: false,
			hideIdentifyingTagsMode: "show",
			taskCreationDefaults: {
				inheritParentTaskProperties: true,
			},
		};

		const view = new TestBasesView({}, container, plugin);
		(view as any).config = {
			filters: {
				conjunction: "and",
				filters: [
					{ rule: { text: 'file.hasTag("task")' } },
					{
						rule: {
							text: "file.hasLink(this.file) && list(note.projects).contains(this.file.asLink())",
						},
					},
				],
			},
		};

		await view.createFileForView("New Task");

		expect(TaskCreationModal).toHaveBeenCalledWith(
			expect.anything(),
			expect.anything(),
			expect.objectContaining({
				prePopulatedValues: expect.objectContaining({
					projects: ["[[Projects/Roadmap]]", "[[Alpha]]"],
					tags: ["task", "project-a", "urgent"],
				}),
			})
		);
	});
});
