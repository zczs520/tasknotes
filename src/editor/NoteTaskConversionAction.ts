import { MarkdownView, TFile, type WorkspaceLeaf } from "obsidian";

import type TaskNotesPlugin from "../main";
import { EVENT_DATA_CHANGED, EVENT_TASK_DELETED, EVENT_TASK_UPDATED } from "../types";

const CONVERT_ACTION_CLASS = "tasknotes-convert-note-action";

export function shouldShowNoteTaskConversionAction<TFileLike extends { extension: string }>(
	file: TFileLike | null,
	isTaskFile: (file: TFileLike) => boolean
): boolean {
	return Boolean(file && file.extension === "md" && !isTaskFile(file));
}

function isTaskNote(plugin: TaskNotesPlugin, file: TFile): boolean {
	const metadata = plugin.app.metadataCache.getFileCache(file);
	return Boolean(metadata?.frontmatter && plugin.cacheManager.isTaskFile(metadata.frontmatter));
}

/**
 * Adds a native view action to ordinary Markdown notes. Keeping this action in
 * Obsidian's own view header makes it available in both editing and reading mode
 * without inserting conversion prompts into the document body.
 */
export function setupNoteTaskConversionActions(plugin: TaskNotesPlugin): () => void {
	const actions = new Map<MarkdownView, HTMLElement>();

	const removeAction = (view: MarkdownView): void => {
		actions.get(view)?.remove();
		actions.delete(view);
	};

	const syncLeaf = (leaf: WorkspaceLeaf): void => {
		const view = leaf.view;
		if (!(view instanceof MarkdownView)) {
			return;
		}

		const shouldShow = shouldShowNoteTaskConversionAction(view.file, (file) =>
			isTaskNote(plugin, file)
		);
		if (!shouldShow) {
			removeAction(view);
			return;
		}

		if (actions.has(view)) {
			return;
		}

		const action = view.addAction(
			"list-plus",
			plugin.i18n.translate("commands.convertCurrentNoteToTask.name"),
			async () => {
				plugin.app.workspace.setActiveLeaf(leaf, { focus: true });
				await plugin.convertCurrentNoteToTask();
			}
		);
		action.addClass(CONVERT_ACTION_CLASS);
		action.createSpan({
			cls: "tasknotes-convert-note-action__label",
			text:
				plugin.i18n.getCurrentLocale() === "zh"
					? "转为任务"
					: plugin.i18n.translate("commands.convertCurrentNoteToTask.name"),
		});
		actions.set(view, action);
	};

	const syncAll = (): void => {
		const currentViews = new Set<MarkdownView>();
		for (const leaf of plugin.app.workspace.getLeavesOfType("markdown")) {
			if (leaf.view instanceof MarkdownView) {
				currentViews.add(leaf.view);
			}
			syncLeaf(leaf);
		}

		for (const view of actions.keys()) {
			if (!currentViews.has(view)) {
				removeAction(view);
			}
		}
	};

	let timer: number | null = null;
	const scheduleSync = (): void => {
		if (timer !== null) {
			window.clearTimeout(timer);
		}
		timer = window.setTimeout(() => {
			timer = null;
			syncAll();
		}, 50);
	};

	const workspaceRefs = [
		plugin.app.workspace.on("active-leaf-change", scheduleSync),
		plugin.app.workspace.on("file-open", scheduleSync),
		plugin.app.workspace.on("layout-change", scheduleSync),
	];
	const metadataRef = plugin.app.metadataCache.on("changed", scheduleSync);
	const emitterRefs = [
		plugin.emitter.on(EVENT_TASK_UPDATED, scheduleSync),
		plugin.emitter.on(EVENT_TASK_DELETED, scheduleSync),
		plugin.emitter.on(EVENT_DATA_CHANGED, scheduleSync),
	];

	syncAll();

	return () => {
		if (timer !== null) {
			window.clearTimeout(timer);
		}
		workspaceRefs.forEach((ref) => plugin.app.workspace.offref(ref));
		plugin.app.metadataCache.offref(metadataRef);
		emitterRefs.forEach((ref) => plugin.emitter.offref(ref));
		actions.forEach((action) => action.remove());
		actions.clear();
	};
}
