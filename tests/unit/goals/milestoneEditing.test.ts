import type { GoalMilestone } from "../../../src/goals/goalTypes";
import {
	renderGoalMilestoneCard,
	isMilestoneComplete,
} from "../../../src/ui/goals/GoalMilestoneCard";
import { managementGoal, managementSetup } from "./goalManagementFixtures";
import * as confirmation from "../../../src/modals/ConfirmationModal";

const flush = async () => {
	for (let i = 0; i < 20; i++) await Promise.resolve();
};
const enter = (input: HTMLInputElement, value: string) => {
	input.value = value;
	input.dispatchEvent(new Event("input"));
};

function setup(milestone: GoalMilestone) {
	const fixture = managementSetup([managementGoal("Goal", { milestones: [milestone] })]);
	const root = document.body.createDiv();
	const changed = jest.fn();
	const card = renderGoalMilestoneCard(root, fixture.plugin, fixture.goals[0], 0, {
		detail: true,
		onChanged: changed,
	});
	return { ...fixture, card, changed };
}

const numeric: GoalMilestone = {
	name: "Users",
	kind: "number",
	current: 5,
	tiers: [10, 100],
	achieved: {},
	hours_at: {},
};
const staged: GoalMilestone = {
	name: "Publish",
	kind: "boolean",
	stages: [
		{ id: "draft", name: "初稿" },
		{ id: "published", name: "发布" },
	],
	achieved: { draft: "2026-11-15" },
	hours_at: { draft: 2 },
};

describe("milestone editing and achieved dates", () => {
	afterEach(() => document.body.replaceChildren());
	it("does not claim full completion when a high numeric value has no achieved records", () => {
		const { card } = setup({ ...numeric, current: 200 });
		expect(card.querySelector(".tn-goal-stock__value")?.textContent).toBe("200 → 待确认达成");
		expect(card.querySelectorAll(".tn-goal-stock__tier.is-achieved")).toHaveLength(0);
	});
	it("omits the default date row and shows only actually completed numeric tier dates", () => {
		const pending = setup(numeric);
		expect(pending.card.querySelector(".tn-goal-stock__tier-labels")).toBeNull();
		const partial = setup({ ...numeric, current: 20, achieved: { "10": "2026-11-15" } });
		const history = partial.card.querySelector(".tn-goal-stock__tier-labels")!;
		expect(history.textContent).toBe("10 · 2026-11-15");
		expect(Array.from(history.children, (node) => node.textContent)).toEqual([
			"10 · 2026-11-15",
			"",
		]);
	});
	it("edits existing milestone names, units and tiers in one save", async () => {
		const { card, service, changed } = setup(numeric);
		card.querySelector<HTMLButtonElement>(".tn-goal-stock__edit")!.click();
		const form = card.querySelector<HTMLFormElement>(".tn-goal-stock__editor")!;
		enter(form.querySelector('input[aria-label="里程碑名称"]')!, "Revenue");
		enter(form.querySelector('input[aria-label="里程碑单位"]')!, "美元");
		enter(form.querySelector('input[aria-label="第 2 档"]')!, "200");
		form.dispatchEvent(new Event("submit", { cancelable: true }));
		await flush();
		expect(service.updateMilestoneDefinition).toHaveBeenCalledWith("Goal.md", 0, {
			name: "Revenue",
			unit: "美元",
			tiers: [10, 200],
		});
		expect(changed).toHaveBeenCalledTimes(1);
		expect(card.querySelector(".tn-goal-stock__editor")).toBeNull();
	});
	it("preserves stage identity when renaming and adding completion tiers, and requires each tier name", async () => {
		const { card, service } = setup(staged);
		card.querySelector<HTMLButtonElement>(".tn-goal-stock__edit")!.click();
		const form = card.querySelector<HTMLFormElement>(".tn-goal-stock__editor")!;
		enter(form.querySelector('input[aria-label="第 1 档阶段名称"]')!, "修订初稿");
		form.querySelector<HTMLButtonElement>(".tn-goal-modal__add-tier")!.click();
		expect(form.querySelector<HTMLButtonElement>('button[type="submit"]')!.disabled).toBe(true);
		enter(form.querySelector('input[aria-label="第 3 档阶段名称"]')!, "复盘");
		expect(form.querySelector<HTMLButtonElement>('button[type="submit"]')!.disabled).toBe(
			false
		);
		form.dispatchEvent(new Event("submit", { cancelable: true }));
		await flush();
		expect(service.updateMilestoneDefinition).toHaveBeenCalledWith("Goal.md", 0, {
			name: "Publish",
			tiers: [],
			stages: [
				{ id: "draft", name: "修订初稿" },
				{ id: "published", name: "发布" },
				{ id: "stage-1", name: "复盘" },
			],
		});
		expect(staged.stages![0].name).toBe("初稿");
	});
	it("shows partial completion correctly and confirms only the next stage", async () => {
		jest.spyOn(confirmation, "showConfirmationModal").mockResolvedValue(true);
		const { card, service } = setup(staged);
		expect(isMilestoneComplete(staged)).toBe(false);
		expect(card.querySelector(".tn-goal-stock__stage-history")?.textContent).toContain(
			"初稿 · 2026-11-15"
		);
		expect(card.querySelectorAll(".tn-goal-stock__stage-record")).toHaveLength(1);
		const next = Array.from(card.querySelectorAll("button")).find(
			(button) => button.textContent === "标记「发布」达成"
		)!;
		next.click();
		await flush();
		expect(service.updateMilestone).toHaveBeenCalledWith("Goal.md", 0, true, "published");
	});
	it("undoes only the selected completed stage", async () => {
		const { card, service } = setup(staged);
		card.querySelector<HTMLButtonElement>(".tn-goal-stock__stage-record button")!.click();
		await flush();
		expect(service.undoMilestoneAchievement).toHaveBeenCalledWith("Goal.md", 0, "draft");
	});
	it("never reuses the identity of a removed completed stage for a new stage", async () => {
		const { card, service } = setup({
			...staged,
			stages: [
				{ id: "stage-1", name: "Old" },
				{ id: "stage-2", name: "Keep" },
			],
			achieved: { "stage-1": "2026-11-15" },
		});
		card.querySelector<HTMLButtonElement>(".tn-goal-stock__edit")!.click();
		const form = card.querySelector<HTMLFormElement>(".tn-goal-stock__editor")!;
		form.querySelector<HTMLButtonElement>('button[aria-label="移除第 1 档"]')!.click();
		form.querySelector<HTMLButtonElement>(".tn-goal-modal__add-tier")!.click();
		enter(form.querySelector('input[aria-label="第 2 档阶段名称"]')!, "New");
		form.dispatchEvent(new Event("submit", { cancelable: true }));
		await flush();
		expect(service.updateMilestoneDefinition).toHaveBeenCalledWith(
			"Goal.md",
			0,
			expect.objectContaining({
				stages: [
					{ id: "stage-2", name: "Keep" },
					{ id: "stage-3", name: "New" },
				],
			})
		);
	});
	it("keeps failed edits for retry and lets cancel discard changes", async () => {
		const { card, service, changed } = setup(numeric);
		service.updateMilestoneDefinition.mockRejectedValueOnce(new Error("Write failed"));
		card.querySelector<HTMLButtonElement>(".tn-goal-stock__edit")!.click();
		const form = card.querySelector<HTMLFormElement>(".tn-goal-stock__editor")!;
		enter(form.querySelector('input[aria-label="里程碑名称"]')!, "Keep draft");
		form.dispatchEvent(new Event("submit", { cancelable: true }));
		await flush();
		expect(form.querySelector<HTMLInputElement>('input[aria-label="里程碑名称"]')!.value).toBe(
			"Keep draft"
		);
		expect(
			form.querySelector<HTMLButtonElement>(".tn-goal-modal__milestone-kinds button")!
				.disabled
		).toBe(true);
		expect(changed).not.toHaveBeenCalled();
		Array.from(form.querySelectorAll("button"))
			.find((button) => button.textContent === "取消")!
			.click();
		expect(card.querySelector(".tn-goal-stock__editor")).toBeNull();
	});
});
