import fs from "fs";
import path from "path";

function extractCssBlock(css: string, selector: string): string {
	const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
	const match = css.match(new RegExp(`${escapedSelector}\\s*\\{([^}]*)\\}`));
	return match?.[1] ?? "";
}

describe("task-card time-tracking hover contrast", () => {
	it("keeps stop and complete labels semantic instead of turning them white", () => {
		const css = fs.readFileSync(
			path.resolve(__dirname, "../../../styles/task-card-bem.css"),
			"utf8"
		);

		for (const action of ["stop", "complete"]) {
			const block = extractCssBlock(
				css,
				`.tasknotes-plugin .task-card__time-tracking-action--${action}:hover`
			);
			expect(block).toContain(`color: var(--tn-color-${action === "stop" ? "info" : "success"})`);
			expect(block).not.toContain("color: var(--text-on-accent)");
			expect(block).toContain("color-mix");
		}
	});

	it("uses the same readable semantic hover feedback in the floating timer", () => {
		const statusBarCss = fs.readFileSync(
			path.resolve(__dirname, "../../../styles/status-bar.css"),
			"utf8"
		);
		const themeCss = fs.readFileSync(
			path.resolve(__dirname, "../../../styles/theme-integration.css"),
			"utf8"
		);

		for (const [action, color] of [
			["stop", "--tn-color-info"],
			["complete", "--tn-active-green"],
		] as const) {
			const block = extractCssBlock(
				statusBarCss,
				`.tasknotes-plugin.tasknotes-active-task-control .tasknotes-active-task-control__${action}:hover`
			);
			expect(block).toContain(`color: var(${color})`);
			expect(block).toContain("color-mix");
			expect(block).not.toContain("#ffffff");
			expect(block).not.toContain("var(--text-on-accent)");
		}

		expect(themeCss).not.toMatch(
			/tasknotes-active-task-control__complete:hover\s*\{[^}]*color:\s*var\(--text-on-accent\)/s
		);
	});

	it("keeps task-note timer segments independently responsive", () => {
		const css = fs.readFileSync(
			path.resolve(__dirname, "../../../styles/task-card-note-widget.css"),
			"utf8"
		);

		for (const selector of [
			".task-card__time-tracking-status:hover",
			".task-card__time-tracking-action--stop:hover",
			".task-card__time-tracking-action--complete:hover",
		]) {
			const block = extractCssBlock(css, selector);
			expect(block).toContain("background: color-mix");
		}

		expect(css).not.toMatch(
			/task-card__time-tracking-control--active:hover\s*\{[^}]*background:/s
		);
	});
});
