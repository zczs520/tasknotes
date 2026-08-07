import { TFile } from "obsidian";
import { ProjectSubtasksService } from "../../../src/services/ProjectSubtasksService";

describe("ProjectSubtasksService subtask progress", () => {
	it("counts linked task notes using configured status and project fields", () => {
		const parentPath = "Tasks/Parent.md";
		const frontmatterByPath: Record<string, Record<string, unknown>> = {
			"Tasks/Open.md": { isTask: true, parent: ["[[Parent]]"], state: "todo" },
			"Tasks/Done.md": { isTask: true, parent: ["[[Parent]]"], state: "finished" },
			"Tasks/Default.md": { isTask: true, parent: ["[[Parent]]"] },
		};
		const metadataCache = {
			resolvedLinks: Object.fromEntries(
				Object.keys(frontmatterByPath).map((path) => [path, { [parentPath]: 1 }])
			),
			getCache: jest.fn((path: string) => {
				const frontmatter = frontmatterByPath[path];
				return frontmatter ? { frontmatter } : null;
			}),
			getFirstLinkpathDest: jest.fn(() => new TFile(parentPath)),
		};
		const plugin = {
			app: { metadataCache },
			cacheManager: {
				on: jest.fn(() => ({})),
				offref: jest.fn(),
				isTaskFile: jest.fn(() => true),
			},
			fieldMapper: {
				toUserField: jest.fn((field: string) => (field === "projects" ? "parent" : "state")),
			},
			settings: { defaultTaskStatus: "todo" },
			statusManager: {
				isCompletedStatus: jest.fn((status: string) => status === "finished"),
			},
		};
		const service = new ProjectSubtasksService(plugin as any);

		expect(service.getSubtaskProgressSync(parentPath)).toEqual({
			completed: 1,
			total: 3,
			percent: 33,
		});

		frontmatterByPath["Tasks/Open.md"].state = "finished";
		service.invalidateIndex();

		expect(service.getSubtaskProgressSync(parentPath)).toEqual({
			completed: 2,
			total: 3,
			percent: 67,
		});
	});

	it("deduplicates repeated parent links and returns null without subtasks", () => {
		const parentPath = "Tasks/Parent.md";
		const childPath = "Tasks/Child.md";
		const frontmatter = {
			isTask: true,
			projects: ["[[Parent]]", "[[Parent]]"],
			status: "done",
		};
		const plugin = {
			app: {
				metadataCache: {
					resolvedLinks: { [childPath]: { [parentPath]: 2 } },
					getCache: jest.fn((path: string) =>
						path === childPath ? { frontmatter } : null
					),
					getFirstLinkpathDest: jest.fn(() => new TFile(parentPath)),
				},
			},
			cacheManager: {
				on: jest.fn(() => ({})),
				offref: jest.fn(),
				isTaskFile: jest.fn(() => true),
			},
			fieldMapper: { toUserField: jest.fn((field: string) => field) },
			settings: { defaultTaskStatus: "open" },
			statusManager: { isCompletedStatus: jest.fn((status: string) => status === "done") },
		};
		const service = new ProjectSubtasksService(plugin as any);

		expect(service.getSubtaskProgressSync(parentPath)).toEqual({
			completed: 1,
			total: 1,
			percent: 100,
		});
		expect(service.getSubtaskProgressSync("Tasks/Unrelated.md")).toBeNull();
	});
});
