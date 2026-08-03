import type TaskNotesPlugin from "../../../src/main";
import { createInstantConvertButtons } from "../../../src/editor/InstantConvertButtons";

describe("instant convert editor extension", () => {
	it("reuses one extension for repeated initialization of the same plugin", () => {
		const plugin = {} as TaskNotesPlugin;

		expect(createInstantConvertButtons(plugin)).toBe(createInstantConvertButtons(plugin));
	});
});
