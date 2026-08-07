import { App, TFile } from "obsidian";
import {
	ensureStarterNote,
	STARTER_NOTE_CHINESE_CONTENT,
	STARTER_NOTE_CHINESE_PATH,
	STARTER_NOTE_CONTENT,
	STARTER_NOTE_PATH,
} from "../../../src/bootstrap/starterNote";

async function removeStarterNotesIfPresent(): Promise<void> {
	const app = new App();
	for (const path of [STARTER_NOTE_PATH, STARTER_NOTE_CHINESE_PATH]) {
		const existing = app.vault.getAbstractFileByPath(path);
		if (existing instanceof TFile) {
			await app.vault.delete(existing);
		}
	}
}

function createHost(options: {
	shouldCreateStarterNote: boolean;
	starterNoteCreated?: boolean;
	uiLocale?: string;
}) {
	const app = new App();
	const openFile = jest.fn().mockResolvedValue(undefined);
	(app.workspace as unknown as { getLeaf: jest.Mock }).getLeaf = jest.fn(() => ({ openFile }));

	const settings = {
		starterNoteCreated: options.starterNoteCreated ?? false,
	};

	const saveSettings = jest.fn().mockResolvedValue(undefined);
	const warn = jest.fn();

	return {
		app,
		openFile,
		saveSettings,
		settings,
		warn,
		host: {
			app,
			settings,
			shouldCreateStarterNote: options.shouldCreateStarterNote,
			uiLocale: options.uiLocale,
			saveSettings,
			warn,
		},
	};
}

describe("starter note onboarding", () => {
	beforeEach(async () => {
		await removeStarterNotesIfPresent();
		jest.clearAllMocks();
	});

	it("creates both guides and opens English by default", async () => {
		const { app, host, openFile, saveSettings, settings } = createHost({
			shouldCreateStarterNote: true,
		});

		await expect(ensureStarterNote(host)).resolves.toBe("created");

		const file = app.vault.getAbstractFileByPath(STARTER_NOTE_PATH);
		expect(file).toBeInstanceOf(TFile);
		await expect(app.vault.read(file as TFile)).resolves.toBe(STARTER_NOTE_CONTENT);
		const chineseFile = app.vault.getAbstractFileByPath(STARTER_NOTE_CHINESE_PATH);
		expect(chineseFile).toBeInstanceOf(TFile);
		await expect(app.vault.read(chineseFile as TFile)).resolves.toBe(
			STARTER_NOTE_CHINESE_CONTENT
		);
		expect(settings.starterNoteCreated).toBe(true);
		expect(saveSettings).toHaveBeenCalledTimes(1);
		expect(openFile).toHaveBeenCalledTimes(1);
		expect(openFile.mock.calls[0][0].path).toBe(STARTER_NOTE_PATH);
	});

	it("opens the Chinese guide when the interface locale is Chinese", async () => {
		const { host, openFile } = createHost({
			shouldCreateStarterNote: true,
			uiLocale: "zh-CN",
		});

		await expect(ensureStarterNote(host)).resolves.toBe("created");

		expect(openFile).toHaveBeenCalledTimes(1);
		expect(openFile.mock.calls[0][0].path).toBe(STARTER_NOTE_CHINESE_PATH);
	});

	it("opens an existing starter note without overwriting it", async () => {
		const { app, host, openFile, saveSettings, settings } = createHost({
			shouldCreateStarterNote: true,
		});
		await app.vault.create(STARTER_NOTE_PATH, "custom starter note");

		await expect(ensureStarterNote(host)).resolves.toBe("created");

		const file = app.vault.getAbstractFileByPath(STARTER_NOTE_PATH) as TFile;
		await expect(app.vault.read(file)).resolves.toBe("custom starter note");
		expect(app.vault.getAbstractFileByPath(STARTER_NOTE_CHINESE_PATH)).toBeInstanceOf(TFile);
		expect(settings.starterNoteCreated).toBe(true);
		expect(saveSettings).toHaveBeenCalledTimes(1);
		expect(openFile).toHaveBeenCalledTimes(1);
		expect(openFile.mock.calls[0][0].path).toBe(STARTER_NOTE_PATH);
	});

	it("does not create the starter note for an existing install", async () => {
		const { app, host, openFile, saveSettings } = createHost({
			shouldCreateStarterNote: false,
		});

		await expect(ensureStarterNote(host)).resolves.toBe("not-first-install");

		expect(app.vault.getAbstractFileByPath(STARTER_NOTE_PATH)).toBeNull();
		expect(saveSettings).not.toHaveBeenCalled();
		expect(openFile).not.toHaveBeenCalled();
	});

	it("does not recreate the starter note after it has already been handled", async () => {
		const { app, host, openFile, saveSettings } = createHost({
			shouldCreateStarterNote: true,
			starterNoteCreated: true,
		});

		await expect(ensureStarterNote(host)).resolves.toBe("already-created");

		expect(app.vault.getAbstractFileByPath(STARTER_NOTE_PATH)).toBeNull();
		expect(saveSettings).not.toHaveBeenCalled();
		expect(openFile).not.toHaveBeenCalled();
	});
});
