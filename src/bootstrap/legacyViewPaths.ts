import { TFile, TFolder } from "obsidian";
import type TaskNotesPlugin from "../main";
import { DEFAULT_SETTINGS } from "../settings/defaults";
import { ensureFolderHierarchy } from "./defaultBasesFiles";

export async function migrateLegacyViewPaths(plugin: TaskNotesPlugin): Promise<void> {
	let changed = false;
	for (const [command, destination] of Object.entries(DEFAULT_SETTINGS.commandFileMapping)) {
		const legacy = destination.replace(/^TASKquence\//, "TaskNotes/");
		if (plugin.settings.commandFileMapping[command] !== legacy) continue;
		const file = plugin.app.vault.getAbstractFileByPath(legacy);
		if (file instanceof TFile && !(await plugin.app.vault.adapter.exists(destination))) {
			await ensureFolderHierarchy(plugin.app.vault, "TASKquence/Views");
			await plugin.app.fileManager.renameFile(file, destination);
		}
		plugin.settings.commandFileMapping[command] = destination;
		changed = true;
	}
	if (changed) await plugin.saveSettingsDataOnly();
	// Remove only empty legacy containers; unrelated notes are never removed.
	for (const path of ["TaskNotes/Views", "TaskNotes"]) {
		const folder = plugin.app.vault.getAbstractFileByPath(path);
		if (folder instanceof TFolder && folder.children.length === 0) {
			await plugin.app.fileManager.trashFile(folder);
		}
	}
}
