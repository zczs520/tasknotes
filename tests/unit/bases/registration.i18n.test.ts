import { createI18nService } from "../../../src/i18n";
import { registerBasesTaskList } from "../../../src/bases/registration";
import { registerBasesView } from "../../../src/bases/api";
import type TaskNotesPlugin from "../../../src/main";

jest.mock("obsidian", () => ({
	requireApiVersion: jest.fn(() => true),
	Events: class {
		on(): void {}
		trigger(): void {}
	},
}));

jest.mock("../../../src/bases/api", () => ({
	registerBasesView: jest.fn(() => true),
	unregisterBasesView: jest.fn(),
}));

jest.mock("../../../src/bases/TaskListView", () => ({
	buildTaskListViewFactory: jest.fn(() => jest.fn()),
}));

jest.mock("../../../src/bases/KanbanView", () => ({
	buildKanbanViewFactory: jest.fn(() => jest.fn()),
}));

jest.mock("../../../src/bases/CalendarView", () => ({
	buildCalendarViewFactory: jest.fn(() => jest.fn()),
}));

jest.mock("../../../src/bases/MiniCalendarView", () => ({
	buildMiniCalendarViewFactory: jest.fn(() => jest.fn()),
}));

jest.mock("../../../src/bases/TimeStatisticsView", () => ({
	buildTimeStatisticsViewFactory: jest.fn(() => jest.fn()),
}));

describe("Bases registration localization", () => {
	it("registers Kanban configuration labels in Chinese", async () => {
		const plugin = {
			settings: {
				enableBases: true,
				enableDebugLogging: false,
			},
			i18n: createI18nService({ initialLocale: "zh" }),
			app: {
				workspace: {
					iterateAllLeaves: jest.fn(),
				},
			},
		} as unknown as TaskNotesPlugin;

		await registerBasesTaskList(plugin);

		const registerMock = jest.mocked(registerBasesView);
		const kanbanCall = registerMock.mock.calls.find((call) => call[1] === "tasknotesKanban");
		expect(kanbanCall).toBeDefined();

		const registration = kanbanCall?.[2];
		expect(registration?.name).toBe("TaskNotes 看板");
		const config = {
			get: (key: string) =>
				key === "availableSwimLanes"
					? JSON.stringify(["项目/产品经理/PartnerShare", "创作", "None"])
					: undefined,
		} as never;
		const options = registration?.options?.(config) ?? [];
		const byKey = new Map(
			options
				.filter((option) => option.type !== "group")
				.map((option) => [option.key, option])
		);

		expect(byKey.get("swimLane")?.displayName).toBe("泳道");
		expect(byKey.get("boardFullWidth")?.displayName).toBe("看板使用全宽");
		expect(byKey.get("boardWidth")?.displayName).toBe("看板整体宽度");
		expect(byKey.get("boardSideMargin")?.displayName).toBe("看板左右边距");
		expect(byKey.get("columnWidth")?.displayName).toBe("列宽");
		expect(byKey.get("hideEmptyColumns")?.displayName).toBe("隐藏空列");
		expect(byKey.get("cardLayout")?.displayName).toBe("卡片布局");
		expect(byKey.get("enableSearch")?.displayName).toBe("启用搜索框和时间筛选");
		expect(byKey.get("cardLayout")?.options).toEqual({
			default: "默认",
			compact: "紧凑",
		});
		const visibilityGroup = options.find(
			(option) => option.type === "group" && option.displayName === "显示泳道"
		);
		expect(visibilityGroup?.items.map((item) => item.displayName)).toEqual([
			"项目/产品经理/PartnerShare",
			"创作",
			"None",
		]);

		const timeStatisticsCall = registerMock.mock.calls.find(
			(call) => call[1] === "tasknotesTimeStatistics"
		);
		expect(timeStatisticsCall?.[2].name).toBe("TaskNotes 时间统计");
	});
});
