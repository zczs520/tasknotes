import {
	applyThemeColorMode,
	OBSIDIAN_THEME_COLORS_BODY_CLASS,
} from "../../../src/utils/themeColorMode";

describe("theme color mode", () => {
	it("uses plugin colors without adding an override class", () => {
		applyThemeColorMode(document, true);

		expect(document.body.classList.contains(OBSIDIAN_THEME_COLORS_BODY_CLASS)).toBe(false);
	});

	it("enables and removes Obsidian theme color inheritance", () => {
		applyThemeColorMode(document, false);
		expect(document.body.classList.contains(OBSIDIAN_THEME_COLORS_BODY_CLASS)).toBe(true);

		applyThemeColorMode(document, true);
		expect(document.body.classList.contains(OBSIDIAN_THEME_COLORS_BODY_CLASS)).toBe(false);
	});
});
