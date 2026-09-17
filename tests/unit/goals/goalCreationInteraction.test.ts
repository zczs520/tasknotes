import type TaskNotesPlugin from "../../../src/main";
import { GoalCreationModal } from "../../../src/modals/GoalCreationModal";
import { MockObsidian } from "../../helpers/obsidian-runtime";

function setup(tags = ["工作", "创作"]) {
	let resolveBaseline!: (value: number) => void;
	const baseline = new Promise<number>((resolve) => {
		resolveBaseline = resolve;
	});
	const plugin = {
		app: MockObsidian.createMockApp(),
		i18n: { getCurrentLocale: () => "zh", translate: (key: string) => key },
		cacheManager: { getAllTags: () => tags },
		goalService: {
			listGoals: async () => [],
			findScopeOwner: () => null,
			getFourWeekBaseline: () => baseline,
			createGoalGroup: jest.fn(),
		},
	} as unknown as TaskNotesPlugin;
	const modal = new GoalCreationModal(plugin, () => {}, ["工作"]);
	document.body.appendChild(modal.modalEl);
	return { modal, resolveBaseline };
}

describe("goal creation interaction", () => {
	afterEach(() => document.body.replaceChildren());
	it("keeps the active input and typed value when a baseline arrives", async () => {
		const { modal, resolveBaseline } = setup();
		await modal.onOpen();
		const input = modal.contentEl.querySelector<HTMLInputElement>("[data-target-tag]")!;
		input.focus();
		input.value = "12";
		input.dispatchEvent(new Event("input"));
		resolveBaseline(4.8);
		await Promise.resolve();
		expect(modal.contentEl.querySelector("[data-target-tag]")).toBe(input);
		expect(document.activeElement).toBe(input);
		expect(input.value).toBe("12");
	});
	it("searches tags beyond the former 100-tag limit", async () => {
		const { modal } = setup(
			Array.from({ length: 150 }, (_, i) => `tag-${i.toString().padStart(3, "0")}`)
		);
		await modal.onOpen();
		const search = modal.contentEl.querySelector<HTMLInputElement>(
			".tn-goal-modal__tag-search"
		)!;
		search.value = "tag-149";
		search.dispatchEvent(new Event("input"));
		expect(modal.contentEl.querySelector('[data-goal-tag="tag-149"]')).not.toBeNull();
	});
	it("does not refill a target the user deliberately cleared", async () => {
		const { modal, resolveBaseline } = setup();
		await modal.onOpen();
		const input = modal.contentEl.querySelector<HTMLInputElement>("[data-target-tag]")!;
		input.value = "";
		input.dispatchEvent(new Event("input"));
		resolveBaseline(4.8);
		await Promise.resolve();
		expect(input.value).toBe("");
		expect(modal.contentEl.querySelector<HTMLButtonElement>(".mod-cta")!.disabled).toBe(true);
	});
	it("preserves milestone drafts when switching goal type", async () => {
		const { modal } = setup();
		await modal.onOpen();
		modal.contentEl.querySelector<HTMLButtonElement>(".tn-goal-modal__add-milestone")!.click();
		const name = modal.contentEl.querySelector<HTMLInputElement>(
			".tn-goal-modal__milestone-row input"
		)!;
		name.value = "发布作品";
		name.dispatchEvent(new Event("input"));
		modal.contentEl.querySelectorAll<HTMLButtonElement>(".tn-goal-modal__mode")[2].click();
		expect(
			modal.contentEl.querySelector<HTMLInputElement>(".tn-goal-modal__milestone-row input")!
				.value
		).toBe("发布作品");
	});
	it("requires milestone tiers to increase", async () => {
		const { modal, resolveBaseline } = setup();
		await modal.onOpen();
		resolveBaseline(4);
		await Promise.resolve();
		modal.contentEl.querySelector<HTMLButtonElement>(".tn-goal-modal__add-milestone")!.click();
		const row = modal.contentEl.querySelector(".tn-goal-modal__milestone-row")!;
		const name = row.querySelector<HTMLInputElement>(".tn-goal-modal__milestone-header input")!;
		name.value = "收入";
		name.dispatchEvent(new Event("input"));
		const firstTier = row.querySelector<HTMLInputElement>(".tn-goal-modal__tier-chip input")!;
		firstTier.value = "1000";
		firstTier.dispatchEvent(new Event("input"));
		row.querySelector<HTMLButtonElement>(".tn-goal-modal__add-tier")!.click();
		const tiers = modal.contentEl.querySelectorAll<HTMLInputElement>(
			".tn-goal-modal__tier-chip input"
		);
		tiers[1].value = "100";
		tiers[1].dispatchEvent(new Event("input"));
		expect(modal.contentEl.querySelector<HTMLButtonElement>(".mod-cta")!.disabled).toBe(true);
		tiers[1].value = "2000";
		tiers[1].dispatchEvent(new Event("input"));
		expect(modal.contentEl.querySelector<HTMLButtonElement>(".mod-cta")!.disabled).toBe(false);
	});
	it("allows a goal to be created without any milestone", async () => {
		const { modal, resolveBaseline } = setup();
		await modal.onOpen();
		resolveBaseline(4);
		await Promise.resolve();
		expect(modal.contentEl.querySelector(".tn-goal-modal__milestone-row")).toBeNull();
		expect(modal.contentEl.querySelector<HTMLButtonElement>(".mod-cta")!.disabled).toBe(false);
	});
	it("creates without a why field or reason requirement", async () => {
		const { modal, resolveBaseline } = setup();
		await modal.onOpen();
		resolveBaseline(4);
		await Promise.resolve();
		expect(modal.contentEl.querySelector('[data-goal-field="why"]')).toBeNull();
		expect(modal.contentEl.querySelector<HTMLButtonElement>(".mod-cta")!.disabled).toBe(false);
	});
});
