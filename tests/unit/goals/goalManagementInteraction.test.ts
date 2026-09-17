import { managementGoal, managementSetup } from "./goalManagementFixtures";
import * as confirmation from "../../../src/modals/ConfirmationModal";
import { getGoalPeriodRange } from "../../../src/goals/goalCalculations";
import {
	isMilestoneComplete,
	renderGoalMilestoneCard,
} from "../../../src/ui/goals/GoalMilestoneCard";

const flush = async () => {
	for (let index = 0; index < 16; index++) await Promise.resolve();
};
const change = (input: HTMLInputElement, value: string, event = "change") => {
	input.value = value;
	input.dispatchEvent(new Event(event));
};

describe("reference goal management interactions", () => {
	afterEach(() => document.body.replaceChildren());
	it("renders the goal management surface in English without Chinese control copy", async () => {
		const { renderView, contentEl } = managementSetup(
			[managementGoal("Ship product", { why: "Build a reusable product" })],
			"en"
		);
		await renderView();
		expect(contentEl.querySelector("h1")?.textContent).toBe("Goals");
		expect(contentEl.querySelector(".tn-goals-view__toolbar")?.textContent).toContain(
			"In progress"
		);
		expect(contentEl.querySelector(".tn-goals-view__range")?.textContent).toContain(
			"Back to current"
		);
		expect(contentEl.querySelector(".tn-goals-view__table-head")?.textContent).toContain(
			"Milestones"
		);
		expect(contentEl.querySelector(".tn-goals-view__milestone-empty")?.textContent).toContain(
			"No milestones yet"
		);
	});
	it("uses full native month/quarter ranges instead of presenting weekly data as monthly progress", () => {
		const date = new Date(2026, 8, 17);
		const month = getGoalPeriodRange(managementGoal("月目标", { period: "monthly" }), date);
		const quarter = getGoalPeriodRange(managementGoal("季目标", { period: "quarterly" }), date);
		expect(month.start).toEqual(new Date(2026, 8, 1));
		expect(month.end).toEqual(new Date(2026, 9, 1));
		expect(quarter.start).toEqual(new Date(2026, 6, 1));
		expect(quarter.end).toEqual(new Date(2026, 9, 1));
	});
	it("does not count empty numeric achievement maps as completed", async () => {
		const { goals, renderView, contentEl } = managementSetup();
		await renderView();
		expect(isMilestoneComplete(goals[0].milestones[1])).toBe(false);
		expect(contentEl.querySelector(".tn-goals-view__milestone-count")?.textContent).toBe("1/4");
		expect(contentEl.querySelector(".tn-goals-view__milestone-summary")?.textContent).toContain(
			"已达成 1"
		);
		expect(contentEl.querySelectorAll(".tn-goal-stock.is-complete")).toHaveLength(1);
	});
	it("renders equal tier intervals, blank update inputs, and recorded investment", async () => {
		const { renderView, contentEl } = managementSetup();
		await renderView();
		const card = contentEl.querySelector(".tn-goal-stock")!;
		const dots = [...card.querySelectorAll<HTMLElement>(".tn-goal-stock__tier")];
		dots.forEach((dot, index) =>
			expect(Number.parseFloat(dot.style.left)).toBeCloseTo(((index + 1) / 3) * 100)
		);
		expect(dots[0].className).toContain("is-achieved");
		expect(
			dots.map((dot) => dot.querySelector(".tn-goal-stock__tier-value")?.textContent)
		).toEqual(["$100", "$1000", "$5000"]);
		expect(card.querySelector<HTMLInputElement>("input")!.value).toBe("");
		expect(card.textContent).toContain("103h");
	});
	it("places word-like milestone units after the value on every progress node", () => {
		const { plugin } = managementSetup();
		const revenue = managementGoal("赚钱", {
			milestones: [
				{
					name: "收入",
					kind: "number",
					unit: "美元",
					current: 0,
					tiers: [10, 100],
					achieved: {},
					hours_at: {},
				},
			],
		});
		const card = renderGoalMilestoneCard(document.createElement("div"), plugin, revenue, 0, {
			onChanged: jest.fn(),
		});
		expect(
			Array.from(
				card.querySelectorAll(".tn-goal-stock__tier-value"),
				(node) => node.textContent
			)
		).toEqual(["10美元", "100美元"]);
	});
	it("lets existing numeric milestones set their display unit from goal details", async () => {
		const { renderDetail, modal, service } = managementSetup();
		await renderDetail();
		const input = modal.contentEl.querySelector<HTMLInputElement>(
			'input[aria-label="设置副业月收入单位"]'
		)!;
		change(input, "美元");
		await flush();
		expect(service.updateMilestoneUnit).toHaveBeenCalledWith("造船.md", 0, "美元");
	});
	it("filters the loaded goal snapshot without rescanning tasks or goal files", async () => {
		const { renderView, contentEl, service } = managementSetup();
		await renderView();
		const active = Array.from(
			contentEl.querySelectorAll<HTMLButtonElement>(".tn-goals-view__toolbar button")
		).find((button) => button.textContent === "进行中")!;
		active.click();
		expect(service.getProgress).toHaveBeenCalledTimes(1);
		expect(service.listGoals).not.toHaveBeenCalled();
	});
	it("keeps the existing surface visible while a slower refresh is loading", async () => {
		const { renderView, contentEl, service } = managementSetup();
		await renderView();
		const previous = contentEl.firstElementChild;
		let finish!: () => void;
		const result = await service.getProgress.mock.results[0].value;
		service.getProgress.mockImplementationOnce(
			() =>
				new Promise((resolve) => {
					finish = () => resolve(result);
				})
		);
		const pending = renderView();
		await flush();
		expect(contentEl.firstElementChild).toBe(previous);
		finish();
		await pending;
		expect(contentEl.firstElementChild).not.toBe(previous);
	});
	it("coalesces repeated refresh requests during an in-flight scan", async () => {
		const { renderView, service } = managementSetup();
		const result = await service.getProgress();
		service.getProgress.mockClear();
		let finish!: () => void;
		service.getProgress.mockImplementationOnce(
			() =>
				new Promise((resolve) => {
					finish = () => resolve(result);
				})
		);
		const pending = renderView();
		await flush();
		for (let index = 0; index < 10; index += 1) await renderView();
		expect(service.getProgress).toHaveBeenCalledTimes(1);
		finish();
		await pending;
		expect(service.getProgress).toHaveBeenCalledTimes(2);
	});
	it("debounces file-event bursts and cancels a scheduled refresh on close", async () => {
		jest.useFakeTimers();
		try {
			const { view, renderView, service } = managementSetup();
			await renderView();
			const schedule = () =>
				(view as unknown as { scheduleRender: () => void }).scheduleRender();
			for (let index = 0; index < 10; index += 1) schedule();
			jest.advanceTimersByTime(120);
			await flush();
			expect(service.getProgress).toHaveBeenCalledTimes(2);
			schedule();
			await view.onClose();
			jest.advanceTimersByTime(120);
			await flush();
			expect(service.getProgress).toHaveBeenCalledTimes(2);
		} finally {
			jest.useRealTimers();
		}
	});
	it("keeps current milestone stock editable when the historical table has no progress rows", async () => {
		const { service, goals, renderView, view, contentEl } = managementSetup();
		service.getProgress.mockResolvedValue({
			goals,
			progress: [],
			range: { start: new Date("2025-01-01"), end: new Date("2025-01-08") },
		});
		Object.assign(view, { referenceDate: new Date("2025-01-01") });
		await renderView();
		expect(contentEl.querySelectorAll(".tn-goal-stock")).toHaveLength(4);
		const input = contentEl.querySelector<HTMLInputElement>(".tn-goal-stock input")!;
		change(input, "350");
		await flush();
		expect(service.updateMilestone).toHaveBeenCalledWith("造船.md", 0, 350);
	});
	it("ignores blank values, rejects negatives, and reports failed writes without losing the input", async () => {
		const { plugin, goals, service } = managementSetup();
		const parent = document.createElement("div");
		const changed = jest.fn();
		const card = renderGoalMilestoneCard(parent, plugin, goals[0], 0, { onChanged: changed });
		const input = card.querySelector<HTMLInputElement>("input")!;
		change(input, "");
		change(input, "-1");
		expect(service.updateMilestone).not.toHaveBeenCalled();
		expect(input.getAttribute("aria-invalid")).toBe("true");
		service.updateMilestone.mockRejectedValueOnce(new Error("write failed"));
		change(input, "300");
		await flush();
		expect(card.textContent).toContain("写入失败，请重试");
		expect(input.disabled).toBe(false);
		expect(input.value).toBe("300");
		expect(changed).not.toHaveBeenCalled();
	});
	it("confirms completion directly from the stock card and prevents duplicate submissions", async () => {
		const { plugin, goals, service } = managementSetup();
		jest.spyOn(confirmation, "showConfirmationModal").mockResolvedValue(true);
		const parent = document.createElement("div");
		const card = renderGoalMilestoneCard(parent, plugin, goals[0], 2, { onChanged: jest.fn() });
		const done = card.querySelector<HTMLButtonElement>("button")!;
		done.click();
		done.click();
		await flush();
		expect(confirmation.showConfirmationModal).toHaveBeenCalledTimes(1);
		expect(service.updateMilestone).toHaveBeenCalledTimes(1);
		expect(service.updateMilestone).toHaveBeenCalledWith("造船.md", 2, true);
	});
	it("does not write or refresh after cancelling achievement confirmation", async () => {
		const { plugin, goals, service } = managementSetup();
		jest.spyOn(confirmation, "showConfirmationModal").mockResolvedValue(false);
		const changed = jest.fn();
		const card = renderGoalMilestoneCard(document.createElement("div"), plugin, goals[0], 2, {
			onChanged: changed,
		});
		card.querySelector<HTMLButtonElement>("button")!.click();
		await flush();
		expect(service.updateMilestone).not.toHaveBeenCalled();
		expect(changed).not.toHaveBeenCalled();
	});
	it("places deletion confirmation above the scroll body without rebuilding active fields", async () => {
		const { modal, renderDetail, service } = managementSetup();
		await renderDetail();
		const title = modal.contentEl.querySelector<HTMLInputElement>(".tn-goal-detail__title")!;
		title.value = "正在编辑的名称";
		modal.contentEl.querySelector<HTMLButtonElement>(".tn-goal-detail__delete")!.click();
		const warning = modal.contentEl.querySelector(".tn-goal-detail__delete-warning")!;
		expect(warning.previousElementSibling?.className).toContain("__header");
		expect(warning.nextElementSibling?.className).toContain("__body");
		expect(modal.contentEl.querySelector(".tn-goal-detail__title")).toBe(title);
		warning.querySelector<HTMLButtonElement>("button")!.click();
		expect(title.value).toBe("正在编辑的名称");
		expect(service.deleteGoal).not.toHaveBeenCalled();
	});
	it("updates parent-preservation confirmation and deletes only once", async () => {
		const { modal, renderDetail, service } = managementSetup([
			managementGoal("父目标", { mode: undefined, children: ["子目标"] }),
			managementGoal("子目标", { parent: "父目标" }),
		]);
		await renderDetail();
		const close = jest.spyOn(modal, "close");
		modal.contentEl.querySelector<HTMLButtonElement>(".tn-goal-detail__delete")!.click();
		const warning = modal.contentEl.querySelector(".tn-goal-detail__delete-warning")!;
		const checkbox = warning.querySelector<HTMLInputElement>("input")!;
		checkbox.checked = true;
		checkbox.dispatchEvent(new Event("change"));
		const confirm = warning.querySelector<HTMLButtonElement>(".mod-warning")!;
		expect(confirm.textContent).toBe("仅删除父目标");
		confirm.click();
		confirm.click();
		await flush();
		expect(service.deleteGoal).toHaveBeenCalledTimes(1);
		expect(service.deleteGoal).toHaveBeenCalledWith("父目标.md", true);
		expect(close).toHaveBeenCalled();
	});
	it("retains scroll position after an instant-save rerender and exposes the new milestone editor", async () => {
		const { modal, renderDetail, service } = managementSetup();
		await renderDetail();
		modal.contentEl.querySelector<HTMLElement>(".tn-goal-detail__body")!.scrollTop = 320;
		await renderDetail();
		expect(modal.contentEl.querySelector<HTMLElement>(".tn-goal-detail__body")!.scrollTop).toBe(
			320
		);
		const form = modal.contentEl.querySelector(".tn-goal-detail__add-milestone")!;
		change(
			form.querySelector<HTMLInputElement>("input[aria-label='里程碑名称']")!,
			"发布产品",
			"input"
		);
		form.querySelectorAll<HTMLButtonElement>(
			".tn-goal-modal__milestone-kinds button"
		)[1].click();
		expect(form.querySelector(".tn-goal-modal__tier-row")).toBeNull();
		form.querySelector<HTMLButtonElement>(".mod-cta")!.click();
		await flush();
		expect(service.addMilestone).toHaveBeenCalledWith("造船.md", {
			name: "发布产品",
			tiers: [],
		});
	});
	it("offers searchable checkbox tag selection and disables tags owned by another goal", async () => {
		const { modal, renderDetail, service } = managementSetup([
			managementGoal("造船"),
			managementGoal("工作"),
		]);
		await renderDetail();
		const picker = modal.contentEl.querySelector(".tn-goal-detail__scope-picker")!;
		expect(picker.querySelector<HTMLInputElement>('input[aria-label="工作"]')!.disabled).toBe(
			true
		);
		const search = picker.querySelector<HTMLInputElement>("input[type='search']")!;
		change(search, "创作", "input");
		picker.querySelector<HTMLInputElement>('input[type="checkbox"]')!.click();
		await flush();
		expect(service.updateGoalScope).toHaveBeenCalledWith("造船.md", ["造船", "创作"]);
	});
	it("saves only the title without editing the stored legacy reason", async () => {
		const { modal, renderDetail, service } = managementSetup();
		await renderDetail();
		const title = modal.contentEl.querySelector<HTMLInputElement>(".tn-goal-detail__title")!;
		change(title, "新的造船目标");
		await flush();
		expect(service.updateGoalDetails).toHaveBeenCalledWith("造船.md", {
			name: "新的造船目标",
		});
		service.updateGoalDetails.mockClear();
		change(title, " ");
		await flush();
		expect(service.updateGoalDetails).not.toHaveBeenCalled();
		expect(modal.contentEl.textContent).toContain("目标名称不能为空");
		expect(modal.contentEl.querySelector(".tn-goal-detail__why")).toBeNull();
	});
});
