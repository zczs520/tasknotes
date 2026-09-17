import TaskNotesPlugin from "../../../src/main";
import { DEFAULT_SETTINGS } from "../../../src/settings/defaults";

function setup(lastSeenVersion?: string, showReleaseNotesOnUpdate?: boolean) {
	const plugin = {
		manifest: { version: "5.1.2" },
		settings: { lastSeenVersion, showReleaseNotesOnUpdate },
		saveSettings: jest.fn().mockResolvedValue(undefined),
		activateReleaseNotesView: jest.fn().mockResolvedValue(undefined),
	} as unknown as TaskNotesPlugin;
	return plugin;
}

describe("silent plugin version updates", () => {
	beforeEach(() => jest.useFakeTimers());
	afterEach(() => jest.useRealTimers());

	it.each([true, false, undefined])(
		"does not open release notes on upgrade with legacy preference %s",
		async (preference) => {
			const plugin = setup("5.1.1", preference);
			await TaskNotesPlugin.prototype.checkForVersionUpdate.call(plugin);
			await jest.runAllTimersAsync();
			expect(plugin.activateReleaseNotesView).not.toHaveBeenCalled();
			expect(plugin.settings.lastSeenVersion).toBe("5.1.2");
			expect(plugin.settings.showReleaseNotesOnUpdate).toBe(false);
			expect(plugin.saveSettings).toHaveBeenCalledTimes(1);
		}
	);

	it("records a new installation silently", async () => {
		const plugin = setup();
		await TaskNotesPlugin.prototype.checkForVersionUpdate.call(plugin);
		await jest.runAllTimersAsync();
		expect(plugin.settings.lastSeenVersion).toBe("5.1.2");
		expect(plugin.saveSettings).toHaveBeenCalledTimes(1);
		expect(plugin.activateReleaseNotesView).not.toHaveBeenCalled();
	});

	it("does not rewrite settings when the version is unchanged", async () => {
		const plugin = setup("5.1.2", true);
		await TaskNotesPlugin.prototype.checkForVersionUpdate.call(plugin);
		await jest.runAllTimersAsync();
		expect(plugin.saveSettings).not.toHaveBeenCalled();
		expect(plugin.activateReleaseNotesView).not.toHaveBeenCalled();
	});

	it("defaults to silent updates", () => {
		expect(DEFAULT_SETTINGS.showReleaseNotesOnUpdate).toBe(false);
	});
});
