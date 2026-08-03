import { App, Notice } from "obsidian";
import { KanbanTimeFilterModal } from "../../../src/modals/KanbanTimeFilterModal";

const labels = {
	title: "自定义计划时间范围",
	start: "开始日期",
	end: "结束日期",
	apply: "应用",
	cancel: "取消",
	invalidRange: "日期范围无效",
	thisMonth: "本月",
	lastMonth: "上月",
	recentThreeMonths: "近3月",
	previousMonth: "上个月",
	nextMonth: "下个月",
	chooseDate: "选择日期",
	selectEnd: "选择结束日期",
};

describe("Kanban custom time filter modal", () => {
	beforeEach(() => {
		jest.clearAllMocks();
	});

	it("returns a range selected directly from the calendar", async () => {
		const modal = new KanbanTimeFilterModal(
			new App(),
			labels,
			{ start: "2026-08-03", end: "2026-08-09" },
			new Date(2026, 7, 5)
		);
		const result = modal.show();
		modal.contentEl.querySelector<HTMLButtonElement>('[data-date="2026-08-12"]')?.click();
		modal.contentEl.querySelector<HTMLButtonElement>('[data-date="2026-08-18"]')?.click();
		modal.contentEl.querySelector<HTMLButtonElement>(".mod-cta")?.click();

		await expect(result).resolves.toEqual({ start: "2026-08-12", end: "2026-08-18" });
	});

	it("fills the last-month shortcut and waits for confirmation", async () => {
		const modal = new KanbanTimeFilterModal(
			new App(),
			labels,
			{ start: "", end: "" },
			new Date(2026, 7, 5)
		);
		const result = modal.show();
		const lastMonth = Array.from(
			modal.contentEl.querySelectorAll<HTMLButtonElement>(
				".tn-kanban-time-range-picker__preset"
			)
		).find((button) => button.textContent === labels.lastMonth);
		lastMonth?.click();

		expect(lastMonth?.classList.contains("is-active")).toBe(true);
		expect(
			modal.contentEl.querySelector(".tn-kanban-time-range-picker__summary")?.textContent
		).toContain("2026-07-01  —  2026-07-31");
		modal.contentEl.querySelector<HTMLButtonElement>(".mod-cta")?.click();
		await expect(result).resolves.toEqual({ start: "2026-07-01", end: "2026-07-31" });
	});

	it("keeps apply disabled until both range endpoints are selected", () => {
		const modal = new KanbanTimeFilterModal(
			new App(),
			labels,
			{ start: "", end: "" },
			new Date(2026, 7, 5)
		);
		void modal.show();
		modal.contentEl.querySelector<HTMLButtonElement>('[data-date="2026-08-12"]')?.click();

		expect(modal.contentEl.querySelector<HTMLButtonElement>(".mod-cta")?.disabled).toBe(true);
		expect(Notice).not.toHaveBeenCalled();
		modal.close();
	});

	it("resolves with no selection when dismissed", async () => {
		const modal = new KanbanTimeFilterModal(new App(), labels, {
			start: "2026-07-27",
			end: "2026-08-02",
		});
		const result = modal.show();
		modal.close();
		await expect(result).resolves.toBeNull();
	});
});
