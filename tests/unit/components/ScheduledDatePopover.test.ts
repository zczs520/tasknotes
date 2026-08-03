import { Notice } from "obsidian";
import { ScheduledDatePopover } from "../../../src/components/ScheduledDatePopover";

const labels = {
	today: "今天",
	tomorrow: "明天",
	thisFriday: "本周五",
	thisSunday: "本周日",
	fridayPassed: "本周五已经过去",
	previousMonth: "上个月",
	nextMonth: "下个月",
	chooseDate: "选择日期",
};

describe("ScheduledDatePopover", () => {
	beforeEach(() => {
		document.body.empty();
		jest.clearAllMocks();
	});

	it("selects tomorrow from the quick actions", () => {
		const anchor = document.body.createEl("button");
		const onSelect = jest.fn();
		new ScheduledDatePopover({
			anchor,
			currentDate: "2026-08-05",
			labels,
			now: new Date(2026, 7, 5),
			onSelect,
		}).show();
		const tomorrow = Array.from(
			document.querySelectorAll<HTMLButtonElement>(".tn-scheduled-date-popover__quick-button")
		).find((button) => button.textContent === labels.tomorrow);
		tomorrow?.click();

		expect(onSelect).toHaveBeenCalledWith("2026-08-06");
		expect(document.querySelector(".tn-scheduled-date-popover")).toBeNull();
	});

	it("shows a small notice instead of selecting Friday on Saturday", () => {
		const anchor = document.body.createEl("button");
		const onSelect = jest.fn();
		new ScheduledDatePopover({
			anchor,
			currentDate: "2026-08-05",
			labels,
			now: new Date(2026, 7, 8),
			onSelect,
		}).show();
		const friday = Array.from(
			document.querySelectorAll<HTMLButtonElement>(".tn-scheduled-date-popover__quick-button")
		).find((button) => button.textContent === labels.thisFriday);
		friday?.click();

		expect(onSelect).not.toHaveBeenCalled();
		expect(Notice).toHaveBeenCalledWith(labels.fridayPassed);
		expect(document.querySelector(".tn-scheduled-date-popover")).not.toBeNull();
	});
});
