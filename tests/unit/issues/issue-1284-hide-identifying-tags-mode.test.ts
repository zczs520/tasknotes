import {
	appendMissingTaskIdentificationTags,
	filterTagsForTaskModalSuggestions,
	filterTaskIdentificationTags,
	isTaskIdentificationTag,
	mergeTaskModalTagSuggestionSources,
} from "../../../src/utils/taskTagFiltering";
import {
	clearEditableTagsFromList,
	getEditableTaskTags,
} from "../../../src/utils/taskTagList";

describe("issue #1284 exact-only identifying tag hiding", () => {
	const tags = ["task", "task/project", "#task/urgent", "taskish", "work"];

	it("keeps the existing hierarchical hiding behavior by default", () => {
		expect(filterTaskIdentificationTags(tags, "task")).toEqual(["taskish", "work"]);
		expect(isTaskIdentificationTag("task/project", "task")).toBe(true);
	});

	it("can hide only the exact task identification tag", () => {
		expect(filterTaskIdentificationTags(tags, "task", "exact-only")).toEqual([
			"task/project",
			"#task/urgent",
			"taskish",
			"work",
		]);
		expect(isTaskIdentificationTag("task/project", "task", "exact-only")).toBe(false);
		expect(isTaskIdentificationTag("#task", "task", "exact-only")).toBe(true);
	});

	it("uses exact-only mode for task modal tag suggestions when hiding is enabled", () => {
		expect(
			filterTagsForTaskModalSuggestions(tags, {
				taskIdentificationMethod: "tag",
				taskTag: "task",
				hideIdentifyingTagsInCards: true,
				hideIdentifyingTagsMode: "exact-only",
			})
		).toEqual(["task/project", "#task/urgent", "taskish", "work"]);
	});

	it("does not filter task modal tag suggestions when hiding is disabled", () => {
		expect(
			filterTagsForTaskModalSuggestions(tags, {
				taskIdentificationMethod: "tag",
				taskTag: "task",
				hideIdentifyingTagsInCards: false,
				hideIdentifyingTagsMode: "exact-only",
			})
		).toEqual(tags);
	});

	it("merges task tags with hierarchical tags from the entire vault", () => {
		expect(
			mergeTaskModalTagSuggestionSources(["拼豆"], {
				"#拼豆": 3,
				"#项目/拼豆": 2,
				"#项目/拼豆/网站": 1,
			})
		).toEqual(["拼豆", "项目/拼豆", "项目/拼豆/网站"]);
	});

	it("normalizes leading hashes and removes case-insensitive duplicates", () => {
		expect(
			mergeTaskModalTagSuggestionSources(["#Work", "task"], {
				"#work": 4,
				"#PROJECT/NEXT": 1,
			})
		).toEqual(["Work", "task", "PROJECT/NEXT"]);
	});

	it("preserves only hidden exact task tags when editable tags change in exact-only mode", () => {
		expect(
			appendMissingTaskIdentificationTags(
				["work"],
				["task", "task/project", "work"],
				"task",
				"exact-only"
			)
		).toEqual(["work", "task"]);
	});

	it("treats nested task tags as editable in exact-only mode", () => {
		const settings = {
			taskIdentificationMethod: "tag",
			taskTag: "task",
			hideIdentifyingTagsMode: "exact-only" as const,
		};

		expect(getEditableTaskTags({ tags: ["task", "task/project", "work"] }, settings)).toEqual([
			"task/project",
			"work",
		]);
		expect(clearEditableTagsFromList(["task", "task/project", "work"], settings)).toEqual([
			"task",
		]);
	});
});
