import { TFile } from "obsidian";

import { shouldShowNoteTaskConversionAction } from "../../../src/editor/NoteTaskConversionAction";

describe("note task conversion action", () => {
	const markdownFile = Object.assign(Object.create(TFile.prototype), {
		extension: "md",
		path: "Notes/Idea.md",
	}) as TFile;

	it("shows only for ordinary Markdown notes", () => {
		expect(shouldShowNoteTaskConversionAction(markdownFile, () => false)).toBe(true);
		expect(shouldShowNoteTaskConversionAction(markdownFile, () => true)).toBe(false);
		expect(shouldShowNoteTaskConversionAction(null, () => false)).toBe(false);
	});
});
