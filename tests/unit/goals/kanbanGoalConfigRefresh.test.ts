import { KanbanView } from "../../../src/bases/KanbanView";
import type TaskNotesPlugin from "../../../src/main";
import type { GoalStripState } from "../../../src/ui/goals/GoalProgressPanel";

describe("Kanban goal state configuration lifecycle", () => {
	beforeEach(() => jest.useFakeTimers());
	afterEach(() => {
		jest.useRealTimers();
		document.body.replaceChildren();
	});

	function setup(asyncSave = false, emitDataDuringSave = false) {
		const root = document.createElement("div");
		document.body.appendChild(root);
		const search = root.createDiv();
		const host = root.createDiv({ cls: "tn-goal-panel-host" });
		const board = root.createDiv();
		const card = board.createDiv({ text: "Keep this card" });
		let finishSave = () => {};
		const controller = {
			view: null as KanbanView | null,
			onConfigChanged: jest.fn(() => {
				if (emitDataDuringSave) controller.view?.onDataUpdated();
				if (!asyncSave) return;
				return new Promise<void>((resolve) => {
					finishSave = resolve;
				});
			}),
		};
		const plugin = { settings: {} } as TaskNotesPlugin;
		const originalHandler = controller.onConfigChanged;
		const view = new KanbanView(controller, root, plugin);
		controller.view = view;
		const render = jest.spyOn(view, "render").mockResolvedValue(undefined);
		Object.assign(view, {
			rootElement: root,
			boardEl: board,
			searchContainerEl: search,
			config: { set: jest.fn(() => controller.onConfigChanged()) },
		});
		const setState = (state: GoalStripState) =>
			(
				view as unknown as {
					setGoalPanelState: (host: HTMLElement, state: GoalStripState) => void;
				}
			).setGoalPanelState(host, state);
		return {
			view,
			render,
			controller,
			originalHandler,
			setState,
			finishSave: () => finishSave(),
			board,
			card,
			host,
		};
	}

	it.each([false, true])(
		"persists goal state without a deferred full refresh (async save: %s)",
		async (asyncSave) => {
			const fixture = setup(asyncSave);
			fixture.setState("open");
			fixture.finishSave();
			await Promise.resolve();
			jest.advanceTimersByTime(1000);
			expect(fixture.originalHandler).toHaveBeenCalledTimes(1);
			expect(fixture.view.config.set).toHaveBeenCalledWith("goalPanelState", "open");
			expect(fixture.render).not.toHaveBeenCalled();
			expect(fixture.board.firstChild).toBe(fixture.card);
		}
	);

	it("still refreshes ordinary view configuration", () => {
		const fixture = setup();
		fixture.view.config.set("columnWidth", 320);
		jest.advanceTimersByTime(1000);
		expect(fixture.render).toHaveBeenCalledTimes(1);
	});

	it("skips only data notifications within the presentation save, not later task updates", () => {
		const fixture = setup(false, true);
		fixture.setState("open");
		jest.advanceTimersByTime(1000);
		expect(fixture.render).not.toHaveBeenCalled();
		fixture.view.onDataUpdated();
		expect(fixture.render).toHaveBeenCalledTimes(1);
	});

	it("does not cancel a real configuration refresh already pending when the overlay opens", () => {
		const fixture = setup();
		fixture.view.config.set("columnWidth", 320);
		fixture.setState("open");
		jest.advanceTimersByTime(1000);
		expect(fixture.render).toHaveBeenCalledTimes(1);
	});

	it("restores normal configuration refresh after a failed presentation save", () => {
		const fixture = setup();
		jest.spyOn(fixture.view.config, "set").mockImplementationOnce(() => {
			throw new Error("Read-only base");
		});
		expect(() => fixture.setState("open")).toThrow("Read-only base");
		fixture.view.config.set("columnWidth", 320);
		jest.advanceTimersByTime(1000);
		expect(fixture.render).toHaveBeenCalledTimes(1);
	});

	it("commits the prepared goal surface while preserving an unsaved milestone edit and scroll", () => {
		const fixture = setup();
		fixture.setState("open");
		const oldOverlay = fixture.host.createDiv({ cls: "tn-goal-strip__overlay" });
		oldOverlay.scrollTop = 75;
		const oldInput = oldOverlay.createEl("input", {
			cls: "tn-goal-pending__input",
			attr: { type: "number", "data-goal-path": "副业.md", "data-milestone-index": "1" },
		});
		oldInput.value = "245";
		oldInput.focus();
		const blur = jest.fn();
		oldInput.addEventListener("blur", blur);
		const next = document.createElement("div");
		next.className = "tn-goal-panel-host";
		const nextOverlay = next.createDiv({ cls: "tn-goal-strip__overlay" });
		const nextInput = nextOverlay.createEl("input", {
			cls: "tn-goal-pending__input",
			attr: { type: "number", "data-goal-path": "副业.md", "data-milestone-index": "1" },
		});
		expect(fixture.host.isConnected).toBe(true);
		expect(next.isConnected).toBe(false);
		(fixture.view as unknown as { mountGoalPanel: (host: HTMLElement) => void }).mountGoalPanel(
			next
		);
		expect(fixture.host.isConnected).toBe(false);
		expect(next.isConnected).toBe(true);
		expect(nextInput.value).toBe("245");
		expect(document.activeElement).toBe(nextInput);
		expect(nextOverlay.scrollTop).toBe(75);
		expect(blur).not.toHaveBeenCalled();
		expect(fixture.board.firstChild).toBe(fixture.card);
		expect(fixture.view.config.set).toHaveBeenCalledTimes(1);
	});

	it("does not restore an already-submitted milestone value into the fresh input", () => {
		const fixture = setup();
		fixture.setState("open");
		const oldInput = fixture.host.createEl("input", {
			cls: "tn-goal-pending__input",
			attr: { "data-goal-path": "副业.md", "data-milestone-index": "1" },
		});
		oldInput.value = "245";
		oldInput.focus();
		oldInput.disabled = true;
		const next = document.createElement("div");
		next.className = "tn-goal-panel-host";
		const nextInput = next.createEl("input", {
			cls: "tn-goal-pending__input",
			attr: { "data-goal-path": "副业.md", "data-milestone-index": "1" },
		});
		(fixture.view as unknown as { mountGoalPanel: (host: HTMLElement) => void }).mountGoalPanel(
			next
		);
		expect(nextInput.value).toBe("");
		expect(document.activeElement).not.toBe(nextInput);
	});
});
