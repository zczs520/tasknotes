import type { App, TFile } from "obsidian";

export async function processVaultFrontMatter(
	app: App,
	file: TFile,
	update: (frontmatter: Record<string, unknown>) => void
): Promise<void> {
	await app.fileManager.processFrontMatter(file, update);
}

export async function createVaultFile(app: App, path: string, content: string): Promise<TFile> {
	return app.vault.create(path, content);
}

export async function createVaultFolder(app: App, path: string): Promise<void> {
	await app.vault.createFolder(path);
}

export async function modifyVaultFile(app: App, file: TFile, content: string): Promise<void> {
	await app.vault.modify(file, content);
}

export async function renameVaultFile(app: App, file: TFile, newPath: string): Promise<void> {
	await app.vault.rename(file, newPath);
}

export async function trashVaultFile(app: App, file: TFile): Promise<void> {
	await app.fileManager.trashFile(file);
}

export async function processVaultFile(
	app: App,
	file: TFile,
	update: (content: string) => string
): Promise<void> {
	await app.vault.process(file, update);
}
