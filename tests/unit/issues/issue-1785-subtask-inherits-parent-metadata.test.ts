import { App, TFile } from "obsidian";
import { buildSubtaskCreationPrePopulatedValues } from "../../../src/services/taskRelationshipActions";
import type { TaskInfo } from "../../../src/types";
import { MockObsidian } from "../../helpers/obsidian-runtime";

const createMockApp = (mockApp: unknown): App => mockApp as App;

function createParentTask(overrides: Partial<TaskInfo> = {}): TaskInfo {
	return {
		title: "Parent task",
		status: "in-progress",
		priority: "high",
		path: "Tasks/Parent task.md",
		archived: false,
		tags: ["task", "task/project", "client-a", "urgent"],
		contexts: ["office", "calls"],
		projects: ["[[Client A]]"],
		...overrides,
	};
}

function createPlugin(settings: Record<string, unknown> = {}) {
	return {
		app: createMockApp(MockObsidian.createMockApp()),
		settings: {
			taskTag: "task",
			taskIdentificationMethod: "tag",
			useFrontmatterMarkdownLinks: false,
			taskCreationDefaults: {
				inheritParentTaskProperties: true,
			},
			...settings,
		},
	};
}

describe("issue #1785 subtask metadata prefill", () => {
	beforeEach(() => {
		MockObsidian.reset();
	});

	it("prefills a new subtask with parent contexts, priority, all tags, and parent link", () => {
		const parentFile = new TFile("Tasks/Parent task.md");
		const values = buildSubtaskCreationPrePopulatedValues(
			createPlugin() as never,
			createParentTask(),
			parentFile
		);

		expect(values.projects).toEqual(["[[Client A]]", "[[Parent task]]"]);
		expect(values.contexts).toEqual(["office", "calls"]);
		expect(values.priority).toBe("high");
		expect(values.tags).toEqual(["task", "task/project", "client-a", "urgent"]);
	});

	it("keeps the complete parent tag list when task identification is property-based", () => {
		const parentFile = new TFile("Tasks/Parent task.md");
		const values = buildSubtaskCreationPrePopulatedValues(
			createPlugin({ taskIdentificationMethod: "property" }) as never,
			createParentTask(),
			parentFile
		);

		expect(values.tags).toEqual(["task", "task/project", "client-a", "urgent"]);
	});

	it("does not inherit status from the parent task", () => {
		const parentFile = new TFile("Tasks/Parent task.md");
		const values = buildSubtaskCreationPrePopulatedValues(
			createPlugin() as never,
			createParentTask(),
			parentFile
		);

		expect(values.status).toBeUndefined();
	});

	it("still copies all parent tags when other parent metadata inheritance is disabled", () => {
		const parentFile = new TFile("Tasks/Parent task.md");
		const values = buildSubtaskCreationPrePopulatedValues(
			createPlugin({
				taskCreationDefaults: {
					inheritParentTaskProperties: false,
				},
			}) as never,
			createParentTask(),
			parentFile
		);

		expect(values).toEqual({
			projects: ["[[Parent task]]"],
			tags: ["task", "task/project", "client-a", "urgent"],
		});
	});
});
