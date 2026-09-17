import { Modal, Notice } from "obsidian";
import type TaskNotesPlugin from "../main";
import type {
	GoalDefinition,
	GoalDraftMilestone,
	GoalGroupDraft,
	GoalMode,
	GoalPeriod,
} from "../goals/goalTypes";
import { goalCopy } from "../goals/goalCopy";
import { normalizeGoalTag } from "../goals/goalCalculations";
import { renderMilestoneDraft } from "../ui/goals/GoalMilestoneDraft";

type DraftItemState = {
	name: string;
	target: string;
	targetEdited?: boolean;
	milestoneName: string;
	milestoneTiers: string;
	milestoneUnit?: string;
	milestoneKind?: "number" | "boolean";
	milestoneVisible?: boolean;
	baseline?: number;
	extraMilestones?: DraftItemState[];
};

function tagLeaf(tag: string): string {
	return tag.split("/").filter(Boolean).pop() ?? tag;
}

function parseTiers(value: string): number[] | null {
	if (!value.trim()) return [];
	const tiers = value.split(/[,，]/u).map((item) => (item.trim() ? Number(item.trim()) : NaN));
	if (tiers.some((tier) => !Number.isFinite(tier) || tier <= 0)) return null;
	if (tiers.some((tier, index) => index > 0 && tier <= tiers[index - 1])) return null;
	return tiers;
}

export class GoalCreationModal extends Modal {
	private mode: GoalMode = "floor";
	private period: GoalPeriod = "weekly";
	private name = "";
	private selectedTags = new Set<string>();
	private split = false;
	private filter = "";
	private itemStates = new Map<string, DraftItemState>();
	private parentMilestoneName = "";
	private parentMilestoneTiers = "";
	private parentMilestoneUnit = "";
	private parentMilestoneKind: "number" | "boolean" = "number";
	private parentMilestoneVisible = false;
	private parentExtraMilestones: DraftItemState[] = [];
	private goals: GoalDefinition[] = [];
	private saving = false;
	private feedback: HTMLElement | null = null;
	private createButton: HTMLButtonElement | null = null;
	private baselines: Map<string, { hours: number; count: number }> | undefined = undefined;
	private closed = false;
	private tags: string[] | undefined = undefined;

	constructor(
		private plugin: TaskNotesPlugin,
		private onCreated: () => void | Promise<void>,
		prefilledTags: readonly string[] = []
	) {
		super(plugin.app);
		this.selectedTags = new Set(prefilledTags);
		this.split = prefilledTags.length >= 2;
		if (prefilledTags.length === 1) this.name = tagLeaf(prefilledTags[0]);
	}

	async onOpen(): Promise<void> {
		this.closed = false;
		this.modalEl.addClass("tn-goal-modal");
		this.goals = await this.plugin.goalService.listGoals();
		if (this.closed) return;
		this.render();
		void this.plugin.goalService
			.getFourWeekBaselines()
			.then((baselines) => {
				if (this.closed) return;
				this.baselines = baselines;
				for (const [tag, state] of this.itemStates) this.applyBaseline(tag, state);
				for (const item of this.contentEl.querySelectorAll<HTMLElement>(
					"[data-baseline-tag]"
				)) {
					const baseline =
						this.itemStates.get(item.dataset.baselineTag ?? "")?.baseline ?? 0;
					item.setText(`${baseline.toFixed(1)} ${this.mode === "count" ? "次" : "h"}/周`);
				}
				for (const input of this.contentEl.querySelectorAll<HTMLInputElement>(
					"[data-target-tag]"
				)) {
					const state = this.itemStates.get(input.dataset.targetTag ?? "");
					if (
						state &&
						!input.value &&
						this.contentEl.ownerDocument.activeElement !== input
					)
						input.value = state.target;
				}
				this.updateCreateButton();
			})
			.catch((error) => {
				if (!this.closed) new Notice(`无法读取近四周投入：${String(error)}`, 8000);
			});
	}

	onClose(): void {
		this.closed = true;
		this.contentEl.empty();
	}

	private getTags(): string[] {
		this.tags ??= [...this.plugin.cacheManager.getAllTags()]
			.map((tag) => tag.replace(/^#/u, ""))
			.filter(Boolean)
			.sort((left, right) => left.localeCompare(right));
		return this.tags;
	}

	private applyBaseline(tag: string, state: DraftItemState): void {
		if (!this.baselines) return;
		const baseline = this.baselines.get(normalizeGoalTag(tag));
		state.baseline = (this.mode === "count" ? baseline?.count : baseline?.hours) ?? 0;
		if (!state.target && !state.targetEdited)
			state.target = String(Math.max(1, Math.round(state.baseline || 1)));
	}

	private getItemState(tag: string): DraftItemState {
		let state = this.itemStates.get(tag);
		if (!state) {
			state = {
				name: tagLeaf(tag),
				target: "",
				milestoneName: "",
				milestoneTiers: "",
				milestoneKind: "number",
				milestoneVisible: false,
			};
			this.itemStates.set(tag, state);
			this.applyBaseline(tag, state);
		}
		return state;
	}

	private renderModeCards(parent: HTMLElement): void {
		const hintKeys = {
			floor: "floorHint",
			ceiling: "ceilingHint",
			count: "countHint",
		} as const;
		const grid = parent.createDiv({ cls: "tn-goal-modal__mode-grid" });
		for (const mode of ["floor", "ceiling", "count"] as const) {
			const button = grid.createEl("button", {
				cls: `tn-goal-modal__mode${this.mode === mode ? " is-selected" : ""}`,
				attr: { type: "button" },
			});
			button.createSpan({
				cls: "tn-goal-modal__mode-name",
				text: goalCopy(this.plugin, mode),
			});
			button.createSpan({
				cls: "tn-goal-modal__mode-hint",
				text: goalCopy(this.plugin, hintKeys[mode]),
			});
			button.addEventListener("click", () => {
				this.mode = mode;
				for (const state of this.itemStates.values()) {
					state.baseline = undefined;
				}
				const previous = new Map(this.itemStates);
				this.itemStates.clear();
				for (const [tag, old] of previous) {
					const next = this.getItemState(tag);
					next.name = old.name;
					next.milestoneName = old.milestoneName;
					next.milestoneTiers = old.milestoneTiers;
					next.milestoneUnit = old.milestoneUnit;
					next.milestoneKind = old.milestoneKind;
					next.milestoneVisible = old.milestoneVisible;
					next.extraMilestones = old.extraMilestones;
				}
				this.render();
			});
		}
	}

	private renderTags(parent: HTMLElement): void {
		const section = parent.createDiv({ cls: "tn-goal-modal__tags" });
		const heading = section.createDiv({ cls: "tn-goal-modal__section-heading" });
		heading.createSpan({ text: goalCopy(this.plugin, "scope") });
		heading.createSpan({
			cls: "tn-goal-modal__section-meta",
			text: `已选 ${this.selectedTags.size} 个 · 过去 4 周实际`,
		});
		const chips = section.createDiv({ cls: "tn-goal-modal__chips" });
		for (const tag of this.selectedTags) {
			const chip = chips.createEl("button", {
				text: `#${tag} ×`,
				attr: { type: "button", "aria-label": `移除标签 ${tag}` },
			});
			chip.addEventListener("click", () => {
				this.selectedTags.delete(tag);
				if (this.selectedTags.size < 2) this.split = false;
				this.render();
			});
		}
		const picker = section.createDiv({ cls: "tn-goal-modal__picker" });
		const search = picker.createEl("input", {
			cls: "tn-goal-modal__tag-search",
			attr: {
				type: "search",
				placeholder: goalCopy(this.plugin, "addTag"),
				value: this.filter,
				"aria-label": goalCopy(this.plugin, "addTag"),
			},
		});
		const list = picker.createDiv({ cls: "tn-goal-modal__tag-list" });
		const drawList = (): void => {
			list.empty();
			const query = this.filter.trim().replace(/^#/u, "");
			const tags = [...new Set([...this.selectedTags, ...this.getTags()])].filter((tag) =>
				tag.toLocaleLowerCase().includes(query.toLocaleLowerCase())
			);
			const pick = (tag: string): void => {
				if (this.selectedTags.has(tag)) this.selectedTags.delete(tag);
				else this.selectedTags.add(tag);
				if (this.selectedTags.size === 2) this.split = true;
				if (this.selectedTags.size < 2) this.split = false;
				this.render();
			};
			for (const tag of tags) {
				const owner = this.plugin.goalService.findScopeOwner(this.goals, tag);
				const row = list.createEl("label", {
					cls: `tn-goal-modal__tag${owner ? " is-owned" : ""}${this.selectedTags.has(tag) ? " is-selected" : ""}`,
					attr: { "data-goal-tag": tag },
				});
				const checkbox = row.createEl("input", {
					attr: { type: "checkbox", "aria-label": tag },
				});
				checkbox.checked = this.selectedTags.has(tag);
				checkbox.disabled = Boolean(owner);
				row.createSpan({ cls: "tn-goal-modal__tag-name", text: tag });
				if (owner)
					row.createSpan({
						cls: "tn-goal-modal__tag-owner",
						text: `已属于 ${owner.name}`,
					});
				else {
					const state = this.getItemState(tag);
					row.createSpan({
						cls: "tn-goal-modal__tag-owner",
						text:
							state.baseline === undefined
								? "…"
								: `${state.baseline.toFixed(1)} ${this.mode === "count" ? "次" : "h"}/周`,
						attr: { "data-baseline-tag": tag },
					});
				}
				checkbox.addEventListener("change", () => pick(tag));
			}
			if (query && !tags.includes(query)) {
				const owner = this.plugin.goalService.findScopeOwner(this.goals, query);
				const add = list.createEl("button", {
					cls: "tn-goal-modal__new-tag",
					text: owner ? `已属于 ${owner.name}` : `+ 添加标签「${query}」`,
					attr: { type: "button" },
				});
				add.disabled = Boolean(owner);
				add.addEventListener("click", () => pick(query));
			}
			if (!tags.length && !query)
				list.createDiv({
					cls: "tn-goal-modal__hint",
					text: "输入一个标签开始，按回车添加",
				});
		};
		search.addEventListener("input", () => {
			this.filter = search.value;
			drawList();
		});
		search.addEventListener("keydown", (event) => {
			if (event.key !== "Enter") return;
			event.preventDefault();
			const tag = search.value.trim().replace(/^#/u, "");
			if (!tag || this.plugin.goalService.findScopeOwner(this.goals, tag)) return;
			this.selectedTags.add(tag);
			if (this.selectedTags.size === 2) this.split = true;
			this.filter = "";
			this.render();
		});
		drawList();
	}

	private renderItem(parent: HTMLElement, tag: string, canRename: boolean): void {
		const state = this.getItemState(tag);
		const item = parent.createDiv({ cls: "tn-goal-modal__target-item" });
		const row = item.createDiv({ cls: "tn-goal-modal__target-row" });
		row.createSpan({
			cls: "tn-goal-modal__target-scope",
			text: canRename ? tag : [...this.selectedTags].join(" + "),
		});
		if (canRename) {
			const name = row.createEl("input", { attr: { type: "text", value: state.name } });
			name.addEventListener("input", () => {
				state.name = name.value;
				this.updateCreateButton();
			});
		}
		row.createSpan({
			cls: "tn-goal-modal__unit",
			text: this.mode === "ceiling" ? "最多" : "至少",
		});
		const target = row.createEl("input", {
			cls: "tn-goal-modal__target-input",
			attr: {
				type: "number",
				min: this.mode === "count" ? "1" : "0.1",
				step: this.mode === "count" ? "1" : "0.5",
				value: state.target,
				"data-target-tag": tag,
				"aria-label": `${tag} 目标值`,
				placeholder: goalCopy(this.plugin, "target"),
			},
		});
		target.addEventListener("input", () => {
			state.targetEdited = true;
			state.target = target.value;
			this.updateCreateButton();
		});
		row.createSpan({ cls: "tn-goal-modal__unit", text: this.mode === "count" ? "次" : "h" });
		const baseline = item.createDiv({ cls: "tn-goal-modal__baseline" });
		baseline.setText(
			state.baseline === undefined
				? `${goalCopy(this.plugin, "baseline")} …`
				: `${goalCopy(this.plugin, "baseline")} ${state.baseline.toFixed(1)}${this.mode === "count" ? " 次/周" : "h/周"}`
		);
		const numericTarget = Number(state.target);
		if (
			this.period === "weekly" &&
			this.mode !== "ceiling" &&
			state.baseline !== undefined &&
			numericTarget > state.baseline * 1.5
		) {
			baseline.addClass("is-warning");
			baseline.appendText(
				state.baseline === 0
					? " · 从零起步，可以先设一个小目标"
					: " · 高于近四周平均值的 1.5 倍"
			);
		}
	}

	private renderMilestone(
		parent: HTMLElement,
		state?: DraftItemState,
		onRemove?: () => void
	): void {
		const draft = {
			name: state?.milestoneName ?? this.parentMilestoneName,
			kind: state?.milestoneKind ?? this.parentMilestoneKind,
			tiers: (state?.milestoneTiers ?? this.parentMilestoneTiers).split(/[,，]/u),
			unit: state?.milestoneUnit ?? this.parentMilestoneUnit,
		};
		renderMilestoneDraft(
			parent,
			draft,
			() => {
				if (state) {
					state.milestoneName = draft.name;
					state.milestoneKind = draft.kind;
					state.milestoneTiers = draft.tiers.join(",");
					state.milestoneUnit = draft.unit;
				} else {
					this.parentMilestoneName = draft.name;
					this.parentMilestoneKind = draft.kind;
					this.parentMilestoneTiers = draft.tiers.join(",");
					this.parentMilestoneUnit = draft.unit;
				}
				this.updateCreateButton();
			},
			() => {
				if (onRemove) onRemove();
				else if (state) {
					state.milestoneName = "";
					state.milestoneTiers = "";
					state.milestoneVisible = false;
				} else {
					this.parentMilestoneName = "";
					this.parentMilestoneTiers = "";
					this.parentMilestoneVisible = false;
				}
				this.render();
			}
		);
	}

	private renderMilestoneGroup(
		parent: HTMLElement,
		owner: string,
		role: "父目标" | "子目标" | "单层目标",
		state?: DraftItemState
	): void {
		const extras = state ? (state.extraMilestones ??= []) : this.parentExtraMilestones;
		const visible = state?.milestoneVisible ?? this.parentMilestoneVisible;
		const group = parent.createDiv({ cls: "tn-goal-modal__milestone-group" });
		const heading = group.createDiv({ cls: "tn-goal-modal__milestone-owner" });
		heading.createSpan({ text: `挂在 ${owner}` });
		heading.createSpan({ cls: "tn-goal-modal__role-chip", text: role });
		const addMilestone = (): void => {
			if (!visible) {
				if (state) state.milestoneVisible = true;
				else this.parentMilestoneVisible = true;
			} else {
				extras.push({
					name: "",
					target: "",
					milestoneName: "",
					milestoneTiers: "",
					milestoneKind: "number",
					milestoneVisible: true,
				});
			}
			this.render();
		};
		const add = heading.createEl("button", {
			text: "+ 里程碑",
			cls: "tn-goal-modal__add-milestone-inline",
			attr: { type: "button" },
		});
		add.addEventListener("click", addMilestone);
		if (visible) this.renderMilestone(group, state);
		for (const extra of extras) {
			this.renderMilestone(group, extra, () => extras.splice(extras.indexOf(extra), 1));
		}
		if (visible || extras.length > 0) return;
		const empty = group.createEl("button", {
			text: `+ 给「${owner}」加一条里程碑 · 不加也可以，时间目标本身就能跑`,
			cls: "tn-goal-modal__add-milestone",
			attr: { type: "button" },
		});
		empty.addEventListener("click", addMilestone);
	}

	private milestoneDraft(
		state: Pick<
			DraftItemState,
			| "milestoneKind"
			| "milestoneName"
			| "milestoneTiers"
			| "milestoneVisible"
			| "milestoneUnit"
		>
	): GoalDraftMilestone | null | undefined {
		if (!state.milestoneVisible) return undefined;
		if (!state.milestoneName.trim()) return null;
		if (state.milestoneKind === "boolean") {
			return { name: state.milestoneName.trim(), tiers: [] };
		}
		const tiers = parseTiers(state.milestoneTiers);
		if (!tiers?.length) return null;
		return {
			name: state.milestoneName.trim(),
			tiers,
			...(state.milestoneUnit?.trim() ? { unit: state.milestoneUnit.trim() } : {}),
		};
	}

	private extraDrafts(states: DraftItemState[]): GoalDraftMilestone[] | null {
		const results: GoalDraftMilestone[] = [];
		for (const state of states) {
			const draft = this.milestoneDraft(state);
			if (draft === null) return null;
			if (draft) results.push(draft);
		}
		return results;
	}

	private buildDraft(): GoalGroupDraft | null {
		const tags = [...this.selectedTags];
		if (!this.name.trim() || tags.length === 0) return null;
		const states = tags.map((tag) => this.getItemState(tag));
		if (states.some((state) => this.milestoneDraft(state) === null)) {
			return null;
		}
		const targets = this.split ? tags : [tags.join("\u0000")];
		const items = targets.map((key) => {
			const state = this.getItemState(this.split ? key : tags[0]);
			const target = Number(state.target);
			const milestone = this.milestoneDraft(state);
			return {
				name: this.split ? state.name.trim() : this.name.trim(),
				target,
				scope: this.split ? [key] : tags,
				milestones: milestone ? [milestone] : [],
			};
		});
		const parentMilestone = this.milestoneDraft({
			milestoneName: this.parentMilestoneName,
			milestoneTiers: this.parentMilestoneTiers,
			milestoneUnit: this.parentMilestoneUnit,
			milestoneKind: this.parentMilestoneKind,
			milestoneVisible: this.parentMilestoneVisible,
		});
		const parentExtras = this.extraDrafts(this.parentExtraMilestones);
		if (!parentExtras || parentMilestone === null) return null;
		for (const [index, item] of items.entries()) {
			const extras = this.extraDrafts(
				this.getItemState(this.split ? tags[index] : tags[0]).extraMilestones ?? []
			);
			if (!extras) return null;
			item.milestones.push(...extras);
		}
		const names = this.split
			? [this.name.trim(), ...items.map((item) => item.name)]
			: [this.name.trim()];
		const existingNames = new Set(this.goals.map((goal) => goal.name.toLocaleLowerCase()));
		if (
			items.some(
				(item) =>
					!item.name ||
					!Number.isFinite(item.target) ||
					item.target <= 0 ||
					(this.mode === "count" && !Number.isInteger(item.target))
			) ||
			new Set(names.map((name) => name.toLocaleLowerCase())).size !== names.length ||
			names.some((name) => existingNames.has(name.toLocaleLowerCase()))
		) {
			return null;
		}
		return {
			name: this.name.trim(),
			mode: this.mode,
			period: this.period,
			split: this.split,
			why: "",
			items,
			parentMilestones: parentMilestone ? [parentMilestone, ...parentExtras] : parentExtras,
		};
	}

	private render(): void {
		const scroll = this.contentEl.scrollTop;
		const active = this.contentEl.ownerDocument.activeElement as HTMLInputElement | null;
		const inputs = [...this.contentEl.querySelectorAll("input, button, textarea")];
		const activeIndex = active ? inputs.indexOf(active) : -1;
		const searchFocused = active?.classList.contains("tn-goal-modal__tag-search");
		this.contentEl.empty();
		this.contentEl.createEl("h2", { text: goalCopy(this.plugin, "newGoal") });
		const form = this.contentEl.createDiv({ cls: "tn-goal-modal__form" });
		const typeRow = form.createDiv({ cls: "tn-goal-modal__field" });
		typeRow.createDiv({ cls: "tn-goal-modal__label", text: goalCopy(this.plugin, "type") });
		this.renderModeCards(typeRow);
		const nameRow = form.createEl("label", { cls: "tn-goal-modal__field" });
		nameRow.createSpan({ cls: "tn-goal-modal__label", text: goalCopy(this.plugin, "name") });
		const name = nameRow.createEl("input", {
			attr: {
				type: "text",
				placeholder: "例如：造船",
				required: "",
				"data-goal-field": "name",
				value: this.name,
				"aria-label": goalCopy(this.plugin, "name"),
			},
		});
		name.addEventListener("input", () => {
			this.name = name.value;
			this.updateCreateButton();
		});
		this.renderTags(form);

		const targetSection = form.createDiv({ cls: "tn-goal-modal__targets" });
		targetSection.hidden = this.selectedTags.size === 0;
		const periodRow = targetSection.createDiv({ cls: "tn-goal-modal__period-row" });
		periodRow.createSpan({
			cls: "tn-goal-modal__label",
			text: goalCopy(this.plugin, "period"),
		});
		const periods = periodRow.createDiv({ cls: "tn-goals-view__segments" });
		for (const value of ["weekly", "monthly", "quarterly"] as const) {
			const button = periods.createEl("button", {
				text: goalCopy(this.plugin, value),
				cls: this.period === value ? "is-selected" : "",
				attr: { type: "button", "aria-pressed": String(this.period === value) },
			});
			button.addEventListener("click", () => {
				this.period = value;
				this.render();
			});
		}
		periodRow.createSpan({
			cls: "tn-goal-modal__hint",
			text: this.split ? "父子目标共用周期，子目标不可单独修改" : "到期自动进入下一个周期",
		});

		if (this.selectedTags.size >= 2) {
			const splitRow = targetSection.createDiv({ cls: "tn-goal-modal__split" });
			const toggle = splitRow.createEl("button", {
				cls: "tn-goal-modal__toggle",
				attr: {
					type: "button",
					role: "switch",
					"aria-checked": String(this.split),
					"aria-label": goalCopy(this.plugin, "split"),
				},
			});
			toggle.createSpan();
			toggle.addEventListener("click", () => {
				this.split = !this.split;
				this.render();
			});
			const copy = splitRow.createDiv();
			copy.createDiv({ text: goalCopy(this.plugin, "split") });
			copy.createDiv({
				cls: "tn-goal-modal__hint",
				text: this.split
					? "每个标签有独立目标值，父目标汇总进度"
					: "所有已选标签合计为一个目标值",
			});
		}
		const targetItems = targetSection.createDiv({ cls: "tn-goal-modal__target-items" });
		if (this.split) {
			for (const tag of this.selectedTags) this.renderItem(targetItems, tag, true);
		} else if (this.selectedTags.size > 0) {
			this.renderItem(targetItems, [...this.selectedTags][0], false);
		}

		const milestones = form.createDiv({ cls: "tn-goal-modal__milestones" });
		milestones.hidden = this.selectedTags.size === 0;
		milestones.createDiv({
			cls: "tn-goal-modal__label",
			text: goalCopy(this.plugin, "milestone"),
		});
		milestones.createDiv({
			cls: "tn-goal-modal__hint",
			text: "可选 · 数值里程碑添加递增档位；完成型不需要档位",
		});
		if (this.split) {
			this.renderMilestoneGroup(milestones, this.name || "父目标", "父目标");
			for (const tag of this.selectedTags) {
				const state = this.getItemState(tag);
				this.renderMilestoneGroup(milestones, state.name || tagLeaf(tag), "子目标", state);
			}
		} else if (this.selectedTags.size) {
			this.renderMilestoneGroup(
				milestones,
				this.name || "当前目标",
				"单层目标",
				this.getItemState([...this.selectedTags][0] ?? "")
			);
		}

		this.feedback = form.createDiv({
			cls: "tn-goal-modal__feedback",
			attr: { role: "status", "aria-live": "polite" },
		});
		const footer = this.contentEl.createDiv({ cls: "tn-goal-modal__footer" });
		footer.createSpan({
			text: `${this.split ? this.selectedTags.size + 1 : 1} ${goalCopy(this.plugin, "files")}`,
		});
		const cancel = footer.createEl("button", { text: goalCopy(this.plugin, "cancel") });
		cancel.addEventListener("click", () => this.close());
		const create = footer.createEl("button", {
			cls: "mod-cta",
			text: goalCopy(this.plugin, "createGoal"),
		});
		this.createButton = create;
		create.disabled = !this.buildDraft() || this.saving;
		create.addEventListener("click", () => void this.save());
		this.updateCreateButton();
		const focus = searchFocused
			? this.contentEl.querySelector<HTMLInputElement>(".tn-goal-modal__tag-search")
			: this.contentEl.querySelectorAll<HTMLElement>("input, button, textarea")[activeIndex];
		focus?.focus({ preventScroll: true });
		this.contentEl.scrollTop = scroll;
	}

	private updateCreateButton(): void {
		const valid = Boolean(this.buildDraft());
		if (this.createButton) {
			this.createButton.disabled = !valid || this.saving;
			this.createButton.setText(
				this.saving ? "正在创建…" : goalCopy(this.plugin, "createGoal")
			);
		}
		if (this.feedback)
			this.feedback.setText(
				valid
					? ""
					: !this.name.trim()
						? "请填写目标名称"
						: !this.selectedTags.size
							? "至少选择一个标签"
							: "请检查：名称不能重复，目标值须大于零，档位须为递增正数并填写指标名称"
			);
	}

	private async save(): Promise<void> {
		const draft = this.buildDraft();
		if (!draft || this.saving) return;
		this.saving = true;
		this.render();
		try {
			await this.plugin.goalService.createGoalGroup(draft);
			new Notice(goalCopy(this.plugin, "created"));
			this.close();
			await this.onCreated();
		} catch (error) {
			this.saving = false;
			new Notice(`${goalCopy(this.plugin, "createFailed")}: ${String(error)}`, 8000);
			this.render();
		}
	}
}
