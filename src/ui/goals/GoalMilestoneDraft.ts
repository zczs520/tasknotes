import type { GoalDraftMilestone } from "../../goals/goalTypes";

export interface MilestoneDraftState {
	name: string;
	kind: "number" | "boolean";
	tiers: string[];
	unit?: string;
}

export function parseMilestoneDraft(state: MilestoneDraftState): GoalDraftMilestone | null {
	if (!state.name.trim()) return null;
	const tiers = state.kind === "boolean" ? [] : state.tiers.map((value) => Number(value.trim()));
	if (
		state.kind === "number" &&
		(!tiers.length ||
			tiers.some(
				(value, index) =>
					!state.tiers[index].trim() ||
					!Number.isFinite(value) ||
					value <= 0 ||
					(index > 0 && value <= tiers[index - 1])
			))
	)
		return null;
	return {
		name: state.name.trim(),
		tiers,
		...(state.kind === "number" && state.unit?.trim() ? { unit: state.unit.trim() } : {}),
	};
}

/** One draft editor for both creation and instant-edit details; typing never rebuilds the row. */
export function renderMilestoneDraft(
	parent: HTMLElement,
	state: MilestoneDraftState,
	onChange: () => void,
	onRemove: () => void
): void {
	const row = parent.createDiv({ cls: "tn-goal-modal__milestone-row" });
	const draw = (): void => {
		row.empty();
		const header = row.createDiv({ cls: "tn-goal-modal__milestone-header" });
		header.createSpan({ cls: "tn-goal-modal__milestone-flag", text: "⚑" });
		const name = header.createEl("input", {
			attr: {
				type: "text",
				value: state.name,
				placeholder: "结果指标名称",
				"aria-label": "里程碑名称",
			},
		});
		name.addEventListener("input", () => {
			state.name = name.value;
			update();
		});
		const kinds = header.createDiv({ cls: "tn-goal-modal__milestone-kinds" });
		for (const kind of ["number", "boolean"] as const) {
			const button = kinds.createEl("button", {
				text: kind === "number" ? "数值递进" : "做完就算完",
				cls: state.kind === kind ? "is-selected" : "",
				attr: { type: "button", "aria-pressed": String(state.kind === kind) },
			});
			button.addEventListener("click", () => {
				state.kind = kind;
				if (!state.tiers.length) state.tiers.push("");
				draw();
				onChange();
				row.querySelector<HTMLButtonElement>(".is-selected")?.focus();
			});
		}
		const remove = header.createEl("button", {
			cls: "tn-goal-modal__remove",
			text: "×",
			attr: { type: "button", "aria-label": "移除此里程碑" },
		});
		remove.addEventListener("click", onRemove);
		if (state.kind === "boolean") {
			row.createDiv({
				cls: "tn-goal-modal__milestone-boolean-hint",
				text: "一个勾选项 · 达成时二次确认并回填累计投入，不需要档位",
			});
			return;
		}
		const tiers = row.createDiv({ cls: "tn-goal-modal__tier-row" });
		const unit = tiers.createEl("input", {
			cls: "tn-goal-modal__milestone-unit",
			attr: {
				type: "text",
				value: state.unit ?? "",
				placeholder: "单位（可选）",
				"aria-label": "里程碑单位",
				title: "例如：美元、人、个",
			},
		});
		unit.addEventListener("input", () => {
			state.unit = unit.value;
			update();
		});
		tiers.createSpan({ cls: "tn-goal-modal__hint", text: "档位" });
		for (const [index, value] of state.tiers.entries()) {
			const chip = tiers.createSpan({ cls: "tn-goal-modal__tier-chip" });
			chip.createSpan({ text: `L${index + 1}` });
			const input = chip.createEl("input", {
				attr: {
					type: "number",
					min: "0",
					step: "any",
					value,
					placeholder: "数值",
					"aria-label": `第 ${index + 1} 档`,
				},
			});
			input.addEventListener("input", () => {
				state.tiers[index] = input.value;
				update();
			});
			const removeTier = chip.createEl("button", {
				text: "×",
				attr: { type: "button", "aria-label": `移除第 ${index + 1} 档` },
			});
			removeTier.addEventListener("click", () => {
				state.tiers.splice(index, 1);
				if (!state.tiers.length) state.tiers.push("");
				draw();
				onChange();
			});
		}
		const add = tiers.createEl("button", {
			cls: "tn-goal-modal__add-tier",
			text: "+ 档",
			attr: { type: "button" },
		});
		add.addEventListener("click", () => {
			state.tiers.push("");
			draw();
			onChange();
			row.querySelectorAll<HTMLInputElement>(".tn-goal-modal__tier-chip input")[
				state.tiers.length - 1
			]?.focus();
		});
		row.createDiv({ cls: "tn-goal-modal__tier-message" });
		update(false);
	};
	const update = (notify = true): void => {
		const message = row.querySelector<HTMLElement>(".tn-goal-modal__tier-message");
		const validTiers = parseMilestoneDraft({ ...state, name: state.name || "指标" });
		message?.toggleClass("is-error", !validTiers);
		message?.setText(
			validTiers
				? `${state.tiers.length} 档 · 进度按档位等分，不按数值等分`
				: "至少填写一档，并按从小到大排列"
		);
		if (notify) onChange();
	};
	draw();
}
