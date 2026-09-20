export const OBSIDIAN_THEME_COLORS_BODY_CLASS = "tasknotes-use-obsidian-theme-colors";

/**
 * Keep the theme color mode on the document body so plugin views, modal portals,
 * and the floating timer all share the same setting without per-component state.
 */
export function applyThemeColorMode(
	doc: Document,
	usePluginThemeColors: boolean
): void {
	doc.body?.classList.toggle(OBSIDIAN_THEME_COLORS_BODY_CLASS, !usePluginThemeColors);
}
