import { App } from "obsidian";
import { DEFAULT_STATUSES } from "../../../src/settings/defaults";
import { deleteKanbanStatus, saveKanbanStatus } from "../../../src/modals/KanbanStatusModal";
import { showConfirmationModal } from "../../../src/modals/ConfirmationModal";

jest.mock("../../../src/modals/ConfirmationModal", () => ({
	showConfirmationModal: jest.fn(),
}));

function host() {
	return {
		app: new App(),
		settings: {
			customStatuses: DEFAULT_STATUSES.map((status) => ({ ...status })),
			defaultTaskStatus: "open",
		},
		saveSettings: jest.fn().mockResolvedValue(undefined),
		i18n: { translate: (key: string) => key },
	};
}

describe("Kanban status refresh", () => {
	it("refreshes after a status edit has been persisted", async () => {
		const plugin = host();
		const refresh = jest.fn().mockResolvedValue(undefined);
		const draft = {
			...plugin.settings.customStatuses[1],
			label: "Ready",
			color: "#123456",
		};

		await expect(saveKanbanStatus(plugin as any, "open", draft, refresh)).resolves.toBe(true);
		expect(plugin.saveSettings).toHaveBeenCalledTimes(1);
		expect(refresh).toHaveBeenCalledTimes(1);
		expect(plugin.settings.customStatuses[1]).toMatchObject({
			label: "Ready",
			color: "#123456",
		});
	});

	it("refreshes after a confirmed deletion but not after cancellation", async () => {
		const plugin = host();
		const refresh = jest.fn().mockResolvedValue(undefined);
		jest.mocked(showConfirmationModal).mockResolvedValueOnce(false);
		await expect(deleteKanbanStatus(plugin as any, "open", refresh)).resolves.toBe(false);
		expect(refresh).not.toHaveBeenCalled();

		jest.mocked(showConfirmationModal).mockResolvedValueOnce(true);
		await expect(deleteKanbanStatus(plugin as any, "open", refresh)).resolves.toBe(true);
		expect(plugin.saveSettings).toHaveBeenCalledTimes(1);
		expect(refresh).toHaveBeenCalledTimes(1);
	});
});
