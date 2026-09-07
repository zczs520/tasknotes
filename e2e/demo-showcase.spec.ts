import { test, expect, Page } from "@playwright/test";
import * as fs from "node:fs";
import * as path from "node:path";
import { execFileSync } from "node:child_process";
import { closeObsidian, launchObsidian, ObsidianApp } from "./obsidian";

const PROJECT_ROOT = path.resolve(__dirname, "..");
const OUTPUT_DIR = path.join(PROJECT_ROOT, "media", "showcase");
const FRAME_ROOT = path.join(PROJECT_ROOT, "test-results", "showcase-frames");
const PYTHON = process.env.TASKNOTES_PYTHON;
const VIEWPORT = { width: 1400, height: 900 };

let app: ObsidianApp;

test.describe.configure({ mode: "serial", timeout: 120_000 });

test.beforeAll(async () => {
	if (!PYTHON) throw new Error("TASKNOTES_PYTHON must point to a Python runtime with Pillow");
	fs.mkdirSync(OUTPUT_DIR, { recursive: true });
	fs.mkdirSync(FRAME_ROOT, { recursive: true });
	app = await launchObsidian();
	await app.page.setViewportSize(VIEWPORT);
	const pluginState = await app.page.evaluate(async () => {
		const obsidianApp = (window as any).app;
		const manager = obsidianApp?.plugins;
		for (const id of ["taskquence"]) {
			if (manager?.manifests?.[id] && !manager?.plugins?.[id]) {
				if (typeof manager.enablePluginAndSave === "function") {
					await manager.enablePluginAndSave(id);
				} else if (typeof manager.enablePlugin === "function") {
					await manager.enablePlugin(id);
				}
			}
		}
		return {
			loaded: Object.keys(manager?.plugins ?? {}),
			manifests: Object.keys(manager?.manifests ?? {}),
		};
	});
	if (!pluginState.loaded.includes("taskquence")) {
		throw new Error(`TASKquence did not load. Plugin state: ${JSON.stringify(pluginState)}`);
	}
	await app.page.addStyleTag({
		content: ".tasknotes-active-task-control { display: none !important; }",
	});
	await app.page.waitForTimeout(1800);
	await app.page.evaluate(() => {
		const obsidianApp = (window as any).app;
		obsidianApp?.workspace?.leftSplit?.collapse?.();
		obsidianApp?.workspace?.rightSplit?.collapse?.();
	});
	await app.page.waitForTimeout(1200);
});

test.afterAll(async () => {
	if (app) await closeObsidian(app);
});

function page(): Page {
	if (!app?.page) throw new Error("Obsidian is not running");
	return app.page;
}

async function openVaultFile(targetPath: string): Promise<void> {
	const opened = await page().evaluate(async (filePath) => {
		const obsidianApp = (window as any).app;
		const file = obsidianApp?.vault?.getAbstractFileByPath?.(filePath);
		if (!file) return false;
		await obsidianApp.workspace.getLeaf(false).openFile(file);
		return true;
	}, targetPath);
	if (!opened) throw new Error(`Could not open ${targetPath}`);
	await page().waitForTimeout(2200);
}

async function runPluginCommand(commandSuffix: string): Promise<void> {
	const commandId = await page().evaluate((suffix) => {
		const obsidianApp = (window as any).app;
		const ids = Object.keys(obsidianApp?.commands?.commands ?? {});
		const id = ids.find((candidate) => candidate.endsWith(`:${suffix}`));
		if (!id) return null;
		obsidianApp.commands.executeCommandById(id);
		return id;
	}, commandSuffix);
	if (!commandId) throw new Error(`Could not find plugin command ending in :${commandSuffix}`);
	await page().waitForTimeout(800);
}

function resetFrames(name: string): string {
	const dir = path.join(FRAME_ROOT, name);
	fs.rmSync(dir, { recursive: true, force: true });
	fs.mkdirSync(dir, { recursive: true });
	return dir;
}

async function captureFrame(frameDir: string, index: number): Promise<number> {
	await page().screenshot({
		path: path.join(frameDir, `frame-${String(index).padStart(3, "0")}.png`),
		animations: "disabled",
		caret: "hide",
	});
	return index + 1;
}

async function hold(frameDir: string, index: number, count: number): Promise<number> {
	let next = index;
	for (let i = 0; i < count; i += 1) next = await captureFrame(frameDir, next);
	return next;
}

function buildGif(frameDir: string, fileName: string, duration = 150): void {
	execFileSync(
		PYTHON!,
		[
			path.join(PROJECT_ROOT, "scripts", "frames-to-gif.py"),
			frameDir,
			path.join(OUTPUT_DIR, fileName),
			"--duration",
			String(duration),
			"--width",
			"1200",
		],
		{ stdio: "inherit" }
	);
}

test("capture overview views", async () => {
	const frameDir = resetFrames("tasknotes-overview");
	let frame = 0;

	await openVaultFile("TaskNotes/Views/Showcase/showcase-kanban.base");
	await expect(page().locator(".workspace-leaf.mod-active")).toBeVisible();
	await page().screenshot({ path: path.join(OUTPUT_DIR, "hero-kanban.png") });
	frame = await hold(frameDir, frame, 12);

	await openVaultFile("TaskNotes/Views/Showcase/showcase-tasks.base");
	await page().screenshot({ path: path.join(OUTPUT_DIR, "tasks-list.png") });
	frame = await hold(frameDir, frame, 10);

	await openVaultFile("TaskNotes/Views/Showcase/showcase-calendar.base");
	const weekButton = page().locator(".workspace-leaf.mod-active button.fc-timeGridWeek-button").first();
	if (
		(await weekButton.isVisible({ timeout: 3000 }).catch(() => false)) &&
		(await weekButton.getAttribute("aria-pressed")) !== "true"
	) {
		await weekButton.click({ force: true });
		await page().waitForTimeout(900);
	}
	await page().screenshot({ path: path.join(OUTPUT_DIR, "calendar-week.png") });
	frame = await hold(frameDir, frame, 10);

	await openVaultFile("TaskNotes/Views/Showcase/showcase-statistics.base");
	const monthButton = page().locator('.workspace-leaf.mod-active button:has-text("月")').first();
	if (await monthButton.isVisible({ timeout: 3000 }).catch(() => false)) {
		await monthButton.click({ force: true });
		await page().waitForTimeout(900);
	}
	await page().screenshot({ path: path.join(OUTPUT_DIR, "time-statistics.png") });
	await hold(frameDir, frame, 12);

	buildGif(frameDir, "tasknotes-overview.gif", 170);
});

test("capture autosaving task creation", async () => {
	const frameDir = resetFrames("task-creation-autosave");
	let frame = 0;

	await runPluginCommand("create-new-task");
	const modal = page().locator(".tn-task-modal--creation").first();
	await expect(modal).toBeVisible({ timeout: 10_000 });
	frame = await hold(frameDir, frame, 6);

	const title = modal.locator("textarea.title-input");
	for (const chunk of ["发布", "新版", "产品", "介绍页"]) {
		await title.type(chunk, { delay: 90 });
		frame = await hold(frameDir, frame, 2);
	}

	const highPriority = modal.locator('[data-field-id="priority"] button[data-value="high"]');
	if (await highPriority.isVisible({ timeout: 2000 }).catch(() => false)) {
		await highPriority.click();
		frame = await hold(frameDir, frame, 4);
	}

	const inProgress = modal.locator('[data-field-id="status"] button[data-value="in-progress"]');
	if (await inProgress.isVisible({ timeout: 2000 }).catch(() => false)) {
		await inProgress.click();
		frame = await hold(frameDir, frame, 4);
	}

	const details = modal.locator(".tn-task-modal__markdown-editor--details .cm-content").first();
	if (await details.isVisible({ timeout: 3000 }).catch(() => false)) {
		await details.click();
		await details.type("完成新版介绍页文案、截图和发布检查。", { delay: 55 });
		frame = await hold(frameDir, frame, 6);
	}

	await page().screenshot({ path: path.join(OUTPUT_DIR, "task-modal-autosave.png") });
	await page().waitForTimeout(1200);
	await modal.locator(".modal-close-button").click();
	await page().waitForTimeout(1000);
	await hold(frameDir, frame, 8);

	buildGif(frameDir, "task-creation-autosave.gif", 135);
});
