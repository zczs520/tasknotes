import { normalizePath, parseYaml, stringifyYaml, TFile } from "obsidian";
import type TaskNotesPlugin from "../main";
import { normalizeGoalsFolder } from "../goals/goalFolder";
import type { TaskInfo } from "../types";
import {
	attributeGoalSegments,
	buildFourWeekGoalBaselines,
	buildGoalProgress,
	calculateGoalPace,
	getGoalSettingsAt,
	normalizeGoalTag,
} from "../goals/goalCalculations";
import type {
	GoalDefinition,
	GoalDraftMilestone,
	GoalGroupDraft,
	GoalMilestone,
	GoalMilestoneProgressSnapshot,
	GoalPeriod,
	GoalProgress,
	GoalSettingsSnapshot,
} from "../goals/goalTypes";
import {
	buildTimeStatisticsSegments,
	getTimeStatisticsRange,
	type TimeStatisticsPeriod,
	type TimeStatisticsRange,
} from "../utils/timeStatistics";
import { createTaskNotesLogger } from "../utils/tasknotesLogger";
import {
	createVaultFile,
	createVaultFolder,
	processVaultFile,
	processVaultFrontMatter,
	trashVaultFile,
} from "./VaultMutationService";

const logger = createTaskNotesLogger({ tag: "Services/GoalService" });

type Frontmatter = Record<string, unknown>;

function stringArray(value: unknown): string[] {
	return Array.isArray(value)
		? value.filter((item): item is string => typeof item === "string" && item.length > 0)
		: [];
}

function numberArray(value: unknown): number[] {
	return Array.isArray(value)
		? value
				.map(Number)
				.filter((item) => Number.isFinite(item))
				.sort((left, right) => left - right)
		: [];
}

function recordValue(value: unknown): Record<string, string> {
	if (!value || typeof value !== "object" || Array.isArray(value)) return {};
	return Object.fromEntries(
		Object.entries(value).filter(
			(entry): entry is [string, string] => typeof entry[1] === "string"
		)
	);
}

function numberRecordValue(value: unknown): Record<string, number> {
	if (!value || typeof value !== "object" || Array.isArray(value)) return {};
	return Object.fromEntries(
		Object.entries(value)
			.map(([key, item]) => [key, Number(item)] as const)
			.filter((entry) => Number.isFinite(entry[1]))
	);
}

function settingsHistoryValue(value: unknown): GoalSettingsSnapshot[] {
	if (!Array.isArray(value)) return [];
	return value
		.map((item): GoalSettingsSnapshot | null => {
			if (!item || typeof item !== "object" || Array.isArray(item)) return null;
			const raw = item as Frontmatter;
			if (typeof raw.date !== "string" || !/^\d{4}-\d{2}-\d{2}$/u.test(raw.date)) {
				return null;
			}
			const target = Number(raw.target);
			const period = isGoalPeriod(raw.period) ? raw.period : undefined;
			return {
				date: raw.date,
				...(Number.isFinite(target) && target > 0 ? { target } : {}),
				...(period ? { period } : {}),
			};
		})
		.filter((item): item is GoalSettingsSnapshot => Boolean(item))
		.sort((left, right) => left.date.localeCompare(right.date));
}

function milestoneProgressHistoryValue(value: unknown): GoalMilestoneProgressSnapshot[] {
	if (!Array.isArray(value)) return [];
	const byDate = new Map<string, GoalMilestoneProgressSnapshot>();
	for (const item of value) {
		if (!item || typeof item !== "object" || Array.isArray(item)) continue;
		const raw = item as Frontmatter;
		const numericValue = Number(raw.value);
		if (
			typeof raw.date !== "string" ||
			!/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/u.test(raw.date) ||
			!Number.isFinite(numericValue) ||
			numericValue < 0
		)
			continue;
		byDate.set(raw.date, { date: raw.date, value: numericValue });
	}
	return [...byDate.values()].sort((left, right) => left.date.localeCompare(right.date));
}

function parseMilestone(value: unknown): GoalMilestone | null {
	if (!value || typeof value !== "object" || Array.isArray(value)) return null;
	const raw = value as Frontmatter;
	if (typeof raw.name !== "string" || !raw.name.trim()) return null;
	const tiers = numberArray(raw.tiers);
	const kind = raw.kind === "number" || tiers.length > 0 ? "number" : "boolean";
	return {
		name: raw.name.trim(),
		kind,
		unit: typeof raw.unit === "string" && raw.unit.trim() ? raw.unit.trim() : undefined,
		current:
			kind === "number" && Number.isFinite(Number(raw.current)) ? Number(raw.current) : 0,
		tiers: kind === "number" ? tiers : undefined,
		achieved:
			kind === "number"
				? recordValue(raw.achieved)
				: typeof raw.achieved === "string"
					? raw.achieved
					: null,
		hours_at:
			kind === "number"
				? numberRecordValue(raw.hours_at)
				: Number.isFinite(Number(raw.hours_at))
					? Number(raw.hours_at)
					: null,
		updatedAt: typeof raw.updated_at === "string" ? raw.updated_at : undefined,
		progressHistory:
			kind === "number" ? milestoneProgressHistoryValue(raw.progress_history) : undefined,
	};
}

function isGoalPeriod(value: unknown): value is GoalPeriod {
	return value === "weekly" || value === "monthly" || value === "quarterly";
}

function extractSection(content: string, heading: string): string {
	const escaped = heading.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
	const match = content.match(
		new RegExp(`^## ${escaped}[^\\S\\n]*\\n([\\s\\S]*?)(?=^## |(?![\\s\\S]))`, "mu")
	);
	return match?.[1]?.trim() ?? "";
}

function parseGoal(file: TFile, frontmatter: Frontmatter, content = ""): GoalDefinition | null {
	if (frontmatter.type !== "goal") return null;
	const mode =
		frontmatter.mode === "floor" ||
		frontmatter.mode === "ceiling" ||
		frontmatter.mode === "count"
			? frontmatter.mode
			: undefined;
	return {
		name: typeof frontmatter.name === "string" ? frontmatter.name : file.basename,
		path: file.path,
		created:
			typeof frontmatter.created === "string"
				? frontmatter.created
				: new Date(file.stat.ctime).toISOString().slice(0, 10),
		status: frontmatter.status === "paused" ? "paused" : "active",
		pausedAt: typeof frontmatter.paused_at === "string" ? frontmatter.paused_at : undefined,
		why: extractSection(content, "为什么"),
		mode,
		target:
			typeof frontmatter.target === "string" || typeof frontmatter.target === "number"
				? frontmatter.target
				: undefined,
		period: isGoalPeriod(frontmatter.period) ? frontmatter.period : mode ? "weekly" : undefined,
		scope: stringArray(frontmatter.scope),
		parent: typeof frontmatter.parent === "string" ? frontmatter.parent : undefined,
		children: stringArray(frontmatter.children),
		milestones: Array.isArray(frontmatter.milestones)
			? frontmatter.milestones
					.map(parseMilestone)
					.filter((item): item is GoalMilestone => Boolean(item))
			: [],
		settingsHistory: settingsHistoryValue(frontmatter.settings_history),
	};
}

function cloneGoal(goal: GoalDefinition): GoalDefinition {
	return {
		...goal,
		scope: [...goal.scope],
		children: [...goal.children],
		milestones: goal.milestones.map((milestone) => ({
			...milestone,
			tiers: milestone.tiers ? [...milestone.tiers] : undefined,
			achieved:
				typeof milestone.achieved === "object" && milestone.achieved !== null
					? { ...milestone.achieved }
					: milestone.achieved,
			hours_at:
				typeof milestone.hours_at === "object" && milestone.hours_at !== null
					? { ...milestone.hours_at }
					: milestone.hours_at,
			progressHistory: milestone.progressHistory?.map((snapshot) => ({ ...snapshot })),
		})),
		settingsHistory: goal.settingsHistory.map((snapshot) => ({ ...snapshot })),
	};
}

function safeGoalName(value: string): string {
	return value
		.trim()
		.replace(/[\\/:*?"<>|]/gu, "-")
		.replace(/[. ]+$/u, "");
}

function milestoneFrontmatter(draft?: GoalDraftMilestone): Frontmatter[] {
	if (!draft?.name.trim()) return [];
	const updatedAt = new Date().toISOString().slice(0, 10);
	if (draft.tiers.length === 0) {
		return [
			{
				name: draft.name.trim(),
				kind: "boolean",
				achieved: null,
				hours_at: null,
				updated_at: updatedAt,
			},
		];
	}
	return [
		{
			name: draft.name.trim(),
			kind: "number",
			...(draft.unit?.trim() ? { unit: draft.unit.trim() } : {}),
			current: 0,
			tiers: [...draft.tiers],
			achieved: {},
			hours_at: {},
			updated_at: updatedAt,
		},
	];
}

function milestonesFrontmatter(drafts: readonly GoalDraftMilestone[]): Frontmatter[] {
	return drafts.flatMap((draft) => milestoneFrontmatter(draft));
}

function encodeMilestone(milestone: GoalMilestone): Frontmatter {
	return {
		name: milestone.name,
		kind: milestone.kind,
		...(milestone.unit ? { unit: milestone.unit } : {}),
		...(milestone.kind === "number"
			? { current: milestone.current ?? 0, tiers: milestone.tiers ?? [] }
			: {}),
		achieved: milestone.achieved,
		hours_at: milestone.hours_at,
		...(milestone.updatedAt ? { updated_at: milestone.updatedAt } : {}),
		...(milestone.progressHistory?.length
			? {
					progress_history: milestone.progressHistory.map((snapshot) => ({
						date: snapshot.date,
						value: snapshot.value,
					})),
				}
			: {}),
	};
}

function formatGoalFile(frontmatter: Frontmatter, why: string): string {
	return `---\n${stringifyYaml(frontmatter).trimEnd()}\n---\n\n## 为什么\n\n${why.trim()}\n\n## 调整记录\n\n- ${new Date().toISOString().slice(0, 10)} 创建目标\n`;
}

function replaceSection(content: string, heading: string, value: string): string {
	const escaped = heading.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
	const section = new RegExp(
		`(^## ${escaped}[^\\S\\n]*\\n)[\\s\\S]*?(?=^## |(?![\\s\\S]))`,
		"mu"
	);
	if (!section.test(content)) return `${content.trimEnd()}\n\n## ${heading}\n\n${value.trim()}\n`;
	return content.replace(
		section,
		(_match: string, prefix: string) => `${prefix}\n${value.trim()}\n\n`
	);
}

export class GoalService {
	get folder(): string {
		return normalizeGoalsFolder(this.plugin.settings.goalsFolder);
	}

	isGoalPath(path: string): boolean {
		return path.startsWith(`${this.folder}/`);
	}

	private goalCache = new Map<
		string,
		{ mtime: number; size: number; goal: GoalDefinition | null }
	>();

	constructor(private plugin: TaskNotesPlugin) {
		plugin.registerEvent(
			plugin.app.vault.on("modify", (file) => this.goalCache.delete(file.path))
		);
		plugin.registerEvent(
			plugin.app.vault.on("delete", (file) => this.goalCache.delete(file.path))
		);
		plugin.registerEvent(
			plugin.app.vault.on("rename", (file, oldPath) => {
				this.goalCache.delete(oldPath);
				this.goalCache.delete(file.path);
			})
		);
	}

	private async readGoal(file: TFile): Promise<GoalDefinition | null> {
		const cached = this.goalCache.get(file.path);
		if (cached?.mtime === file.stat.mtime && cached.size === file.stat.size) {
			return cached.goal ? cloneGoal(cached.goal) : null;
		}
		const { mtime, size } = file.stat;
		const content = await this.plugin.app.vault.cachedRead(file);
		const match = content.match(/^---\s*\n([\s\S]*?)\n---/u);
		const frontmatter = match ? ((parseYaml(match[1]) as Frontmatter | null) ?? {}) : {};
		const goal = parseGoal(file, frontmatter, content);
		this.goalCache.set(file.path, {
			mtime,
			size,
			goal: goal ? cloneGoal(goal) : null,
		});
		return goal;
	}

	async listGoals(): Promise<GoalDefinition[]> {
		const files = this.plugin.app.vault
			.getMarkdownFiles()
			.filter((file) => this.isGoalPath(file.path));
		const currentPaths = new Set(files.map((file) => file.path));
		for (const path of this.goalCache.keys()) {
			if (!currentPaths.has(path)) this.goalCache.delete(path);
		}
		const goals = await Promise.all(files.map((file) => this.readGoal(file)));
		return goals
			.filter((goal): goal is GoalDefinition => Boolean(goal))
			.sort((left, right) => {
				const parentOrder = Number(Boolean(left.parent)) - Number(Boolean(right.parent));
				return parentOrder || left.name.localeCompare(right.name);
			});
	}

	async getGoal(path: string): Promise<GoalDefinition | null> {
		if (!this.isGoalPath(normalizePath(path))) return null;
		const file = this.plugin.app.vault.getAbstractFileByPath(normalizePath(path));
		return file instanceof TFile ? this.readGoal(file) : null;
	}

	async getAdjustmentHistory(path: string): Promise<string[]> {
		const file = this.plugin.app.vault.getAbstractFileByPath(normalizePath(path));
		if (!(file instanceof TFile)) return [];
		return extractSection(await this.plugin.app.vault.cachedRead(file), "调整记录")
			.split("\n")
			.map((line) => line.replace(/^[-*]\s*/u, "").trim())
			.filter(Boolean);
	}

	private async appendAdjustment(file: TFile, message: string): Promise<void> {
		await processVaultFile(this.plugin.app, file, (content) => {
			const line = `- ${new Date().toISOString().slice(0, 10)} ${message}`;
			const current = extractSection(content, "调整记录");
			return replaceSection(content, "调整记录", [line, current].filter(Boolean).join("\n"));
		});
	}

	async createGoalGroup(draft: GoalGroupDraft): Promise<GoalDefinition[]> {
		const folder = this.folder;
		const existing = await this.listGoals();
		const names = draft.split
			? [draft.name, ...draft.items.map((item) => item.name)]
			: [draft.name];
		const cleanNames = names.map(safeGoalName);
		if (cleanNames.some((name) => !name)) throw new Error("Goal names cannot be empty.");
		if (new Set(cleanNames).size !== cleanNames.length)
			throw new Error("Goal names must be unique.");
		const existingNames = new Set(existing.map((goal) => goal.name.toLocaleLowerCase()));
		if (cleanNames.some((name) => existingNames.has(name.toLocaleLowerCase()))) {
			throw new Error("A goal with the same name already exists.");
		}
		if (draft.items.length === 0 || draft.items.some((item) => item.target <= 0)) {
			throw new Error("Every goal needs a positive target.");
		}

		const createdFiles: TFile[] = [];
		try {
			const parts = folder.split("/");
			for (let depth = 1; depth <= parts.length; depth += 1) {
				const path = parts.slice(0, depth).join("/");
				if (!(await this.plugin.app.vault.adapter.exists(path))) {
					await createVaultFolder(this.plugin.app, path);
				}
			}
			const created = new Date().toISOString().slice(0, 10);
			const fileDrafts: Array<{ name: string; frontmatter: Frontmatter }> = [];
			if (draft.split) {
				fileDrafts.push({
					name: cleanNames[0],
					frontmatter: {
						type: "goal",
						name: cleanNames[0],
						created,
						status: "active",
						period: draft.period,
						children: cleanNames.slice(1),
						milestones: milestonesFrontmatter(draft.parentMilestones),
						settings_history: [{ date: created, period: draft.period }],
					},
				});
				draft.items.forEach((item, index) => {
					fileDrafts.push({
						name: cleanNames[index + 1],
						frontmatter: {
							type: "goal",
							name: cleanNames[index + 1],
							created,
							status: "active",
							parent: cleanNames[0],
							mode: draft.mode,
							target: draft.mode === "count" ? item.target : `${item.target}h`,
							period: draft.period,
							scope: item.scope,
							milestones: milestonesFrontmatter(item.milestones),
							settings_history: [
								{ date: created, target: item.target, period: draft.period },
							],
						},
					});
				});
			} else {
				const item = draft.items[0];
				fileDrafts.push({
					name: cleanNames[0],
					frontmatter: {
						type: "goal",
						name: cleanNames[0],
						created,
						status: "active",
						mode: draft.mode,
						target: draft.mode === "count" ? item.target : `${item.target}h`,
						period: draft.period,
						scope: item.scope,
						milestones: milestonesFrontmatter(item.milestones),
						settings_history: [
							{ date: created, target: item.target, period: draft.period },
						],
					},
				});
			}

			for (const item of fileDrafts) {
				const file = await createVaultFile(
					this.plugin.app,
					normalizePath(`${folder}/${item.name}.md`),
					formatGoalFile(item.frontmatter, draft.why)
				);
				createdFiles.push(file);
			}
			return createdFiles.map((file, index) => {
				const parsed = parseGoal(
					file,
					fileDrafts[index].frontmatter,
					formatGoalFile(fileDrafts[index].frontmatter, draft.why)
				);
				if (!parsed) throw new Error(`Created goal could not be read: ${file.path}`);
				return parsed;
			});
		} catch (error) {
			for (const file of [...createdFiles].reverse()) {
				try {
					await trashVaultFile(this.plugin.app, file);
				} catch (rollbackError) {
					logger.error("Failed to roll back a partially created goal", {
						category: "persistence",
						operation: "rollback-goal-creation",
						error: rollbackError,
						details: { path: file.path },
					});
				}
			}
			throw error;
		}
	}

	async getProgress(
		tasks: readonly TaskInfo[],
		period: TimeStatisticsPeriod = "week",
		referenceDate = new Date()
	): Promise<{ goals: GoalDefinition[]; progress: GoalProgress[]; range: TimeStatisticsRange }> {
		const goals = await this.listGoals();
		const weekStartsOn = this.plugin.settings.calendarViewSettings.firstDay ?? 0;
		const range = getTimeStatisticsRange(referenceDate, period, weekStartsOn);
		const now = new Date();
		const segments = buildTimeStatisticsSegments(tasks, range, now);
		const durationDays = (range.end.getTime() - range.start.getTime()) / 86_400_000;
		const settingsDate = new Date(Math.min(now.getTime(), range.end.getTime() - 1));
		// Goal scopes describe attribution rules, not the date from which a tag starts to count.
		// A newly created goal therefore still owns matching time in historical ranges.
		const budgetGoals = goals.map((goal) => {
			const settings = getGoalSettingsAt(goal, settingsDate);
			const target = settings.target;
			const resolved = { ...goal, period: settings.period, target: target ?? undefined };
			if (target === null || period === "year") return resolved;
			const cycleDays =
				settings.period === "monthly"
					? 30.4375
					: settings.period === "quarterly"
						? 91.3125
						: 7;
			return {
				...resolved,
				target: Number(((target * durationDays) / cycleDays).toFixed(1)),
			};
		});
		return {
			goals,
			progress: buildGoalProgress(
				budgetGoals,
				segments,
				calculateGoalPace(range.start, range.end, now)
			),
			range,
		};
	}

	async updateGoalSettings(
		goalPath: string,
		updates: { target?: number; period?: GoalPeriod }
	): Promise<void> {
		const goal = await this.getGoal(goalPath);
		if (!goal) throw new Error("Goal not found.");
		if (
			updates.target !== undefined &&
			(!goal.mode ||
				!Number.isFinite(updates.target) ||
				updates.target <= 0 ||
				(goal.mode === "count" && !Number.isInteger(updates.target)))
		) {
			throw new Error("Target must be a positive number.");
		}
		const goals = await this.listGoals();
		if (goal.parent && updates.period) throw new Error("子目标周期由父目标统一设置。");
		const targets = goal.mode
			? [goal]
			: [goal, ...goals.filter((item) => item.parent === goal.name)];
		const today = new Date().toISOString().slice(0, 10);
		for (const item of targets) {
			const file = this.plugin.app.vault.getAbstractFileByPath(item.path);
			if (!(file instanceof TFile)) throw new Error(`Goal file not found: ${item.path}`);
			await processVaultFrontMatter(this.plugin.app, file, (frontmatter) => {
				if (updates.period) frontmatter.period = updates.period;
				if (updates.target !== undefined && item.path === goal.path) {
					frontmatter.target =
						goal.mode === "count" ? updates.target : `${updates.target}h`;
				}
				const history = settingsHistoryValue(frontmatter.settings_history);
				const sameDay = history.find((snapshot) => snapshot.date === today) ?? {
					date: today,
				};
				if (updates.period) sameDay.period = updates.period;
				if (updates.target !== undefined && item.path === goal.path) {
					sameDay.target = updates.target;
				}
				frontmatter.settings_history = [
					...history.filter((snapshot) => snapshot.date !== today),
					sameDay,
				];
			});
			const adjustment = [
				updates.target !== undefined && item.path === goal.path
					? `target → ${updates.target}${goal.mode === "count" ? "" : "h"}`
					: "",
				updates.period ? `period → ${updates.period}` : "",
			]
				.filter(Boolean)
				.join(" · ");
			if (adjustment) await this.appendAdjustment(file, adjustment);
		}
	}

	async updateGoalDetails(
		goalPath: string,
		updates: { name?: string; why?: string }
	): Promise<void> {
		const goal = await this.getGoal(goalPath);
		if (!goal) throw new Error("Goal not found.");
		const file = this.plugin.app.vault.getAbstractFileByPath(goal.path);
		if (!(file instanceof TFile)) throw new Error("Goal file not found.");
		const nextName = updates.name?.trim() || goal.name;
		if (nextName !== goal.name) {
			const duplicate = (await this.listGoals()).find(
				(item) =>
					item.path !== goal.path &&
					item.name.toLocaleLowerCase() === nextName.toLocaleLowerCase()
			);
			if (duplicate) throw new Error("A goal with the same name already exists.");
			await processVaultFrontMatter(this.plugin.app, file, (frontmatter) => {
				frontmatter.name = nextName;
			});
			const related = await this.listGoals();
			for (const item of related) {
				if (item.parent !== goal.name && !item.children.includes(goal.name)) continue;
				const relatedFile = this.plugin.app.vault.getAbstractFileByPath(item.path);
				if (!(relatedFile instanceof TFile)) continue;
				await processVaultFrontMatter(this.plugin.app, relatedFile, (frontmatter) => {
					if (item.parent === goal.name) frontmatter.parent = nextName;
					if (item.children.includes(goal.name)) {
						frontmatter.children = item.children.map((name) =>
							name === goal.name ? nextName : name
						);
					}
				});
			}
			await this.appendAdjustment(file, `名称 ${goal.name} → ${nextName}`);
		}
		if (updates.why !== undefined && updates.why.trim() !== goal.why.trim()) {
			await processVaultFile(this.plugin.app, file, (content) =>
				replaceSection(content, "为什么", updates.why ?? "")
			);
		}
	}

	async setGoalStatus(goalPath: string, status: "active" | "paused"): Promise<void> {
		const goal = await this.getGoal(goalPath);
		if (!goal) throw new Error("Goal not found.");
		const goals = await this.listGoals();
		const targets = goal.children.length
			? [goal, ...goals.filter((item) => item.parent === goal.name)]
			: [goal];
		const today = new Date().toISOString().slice(0, 10);
		for (const item of targets) {
			const file = this.plugin.app.vault.getAbstractFileByPath(item.path);
			if (!(file instanceof TFile)) continue;
			await processVaultFrontMatter(this.plugin.app, file, (frontmatter) => {
				frontmatter.status = status;
				if (status === "paused") frontmatter.paused_at = today;
				else delete frontmatter.paused_at;
			});
			await this.appendAdjustment(file, status === "paused" ? "暂停跟踪" : "恢复跟踪");
		}
	}

	async deleteGoal(goalPath: string, preserveChildren: boolean): Promise<void> {
		const goal = await this.getGoal(goalPath);
		if (!goal) throw new Error("Goal not found.");
		const goals = await this.listGoals();
		const children = goals.filter((item) => item.parent === goal.name);
		if (children.length > 0 && preserveChildren) {
			for (const child of children) {
				const childFile = this.plugin.app.vault.getAbstractFileByPath(child.path);
				if (!(childFile instanceof TFile)) continue;
				await processVaultFrontMatter(this.plugin.app, childFile, (frontmatter) => {
					delete frontmatter.parent;
				});
				await this.appendAdjustment(childFile, `从父目标「${goal.name}」独立`);
			}
		} else {
			for (const child of children) {
				const childFile = this.plugin.app.vault.getAbstractFileByPath(child.path);
				if (childFile instanceof TFile) await trashVaultFile(this.plugin.app, childFile);
			}
		}
		if (goal.parent) {
			const parent = goals.find((item) => item.name === goal.parent);
			const parentFile = parent && this.plugin.app.vault.getAbstractFileByPath(parent.path);
			if (parent && parentFile instanceof TFile) {
				await processVaultFrontMatter(this.plugin.app, parentFile, (frontmatter) => {
					frontmatter.children = parent.children.filter((name) => name !== goal.name);
				});
			}
		}
		const file = this.plugin.app.vault.getAbstractFileByPath(goal.path);
		if (file instanceof TFile) await trashVaultFile(this.plugin.app, file);
	}

	async removeMilestone(goalPath: string, milestoneIndex: number): Promise<void> {
		const goal = await this.getGoal(goalPath);
		if (!goal) throw new Error("Goal not found.");
		const file = this.plugin.app.vault.getAbstractFileByPath(goal.path);
		if (!(file instanceof TFile)) throw new Error("Goal file not found.");
		await processVaultFrontMatter(this.plugin.app, file, (frontmatter) => {
			const milestones = Array.isArray(frontmatter.milestones)
				? [...frontmatter.milestones]
				: [];
			milestones.splice(milestoneIndex, 1);
			frontmatter.milestones = milestones;
		});
	}

	async updateMilestoneUnit(
		goalPath: string,
		milestoneIndex: number,
		unit: string
	): Promise<void> {
		const goal = await this.getGoal(goalPath);
		const milestone = goal?.milestones[milestoneIndex];
		if (!goal || milestone?.kind !== "number") throw new Error("Numeric milestone not found.");
		const file = this.plugin.app.vault.getAbstractFileByPath(goal.path);
		if (!(file instanceof TFile)) throw new Error("Goal file not found.");
		await processVaultFrontMatter(this.plugin.app, file, (frontmatter) => {
			const milestones = Array.isArray(frontmatter.milestones)
				? [...frontmatter.milestones]
				: [];
			const raw = milestones[milestoneIndex];
			if (!raw || typeof raw !== "object" || Array.isArray(raw))
				throw new Error("Milestone not found.");
			const updated = { ...(raw as Frontmatter) };
			if (unit.trim()) updated.unit = unit.trim();
			else delete updated.unit;
			milestones[milestoneIndex] = updated;
			frontmatter.milestones = milestones;
		});
		this.goalCache.delete(goal.path);
	}

	async updateGoalScope(goalPath: string, scope: readonly string[]): Promise<void> {
		const goal = await this.getGoal(goalPath);
		if (!goal?.mode) throw new Error("Only single and child goals can own tags.");
		const normalized = [
			...new Set(scope.map((item) => item.trim().replace(/^#/u, "")).filter(Boolean)),
		];
		const goals = await this.listGoals();
		for (const item of normalized) {
			const owner = goals.find(
				(candidate) => candidate.path !== goal.path && candidate.scope.includes(item)
			);
			if (owner) throw new Error(`Tag “${item}” already belongs to “${owner.name}”.`);
		}
		const file = this.plugin.app.vault.getAbstractFileByPath(goal.path);
		if (!(file instanceof TFile)) throw new Error("Goal file not found.");
		await processVaultFrontMatter(this.plugin.app, file, (frontmatter) => {
			frontmatter.scope = normalized;
		});
	}

	async addMilestone(goalPath: string, milestone: GoalDraftMilestone): Promise<void> {
		const goal = await this.getGoal(goalPath);
		if (!goal) throw new Error("Goal not found.");
		const encoded = milestoneFrontmatter(milestone)[0];
		if (!encoded) throw new Error("Milestone name cannot be empty.");
		const file = this.plugin.app.vault.getAbstractFileByPath(goal.path);
		if (!(file instanceof TFile)) throw new Error("Goal file not found.");
		await processVaultFrontMatter(this.plugin.app, file, (frontmatter) => {
			frontmatter.milestones = [
				...(Array.isArray(frontmatter.milestones) ? frontmatter.milestones : []),
				encoded,
			];
		});
	}

	findScopeOwner(goals: readonly GoalDefinition[], scope: string): GoalDefinition | null {
		return goals.find((goal) => goal.scope.some((ownedScope) => ownedScope === scope)) ?? null;
	}

	async getFourWeekBaseline(scope: string, mode: "floor" | "ceiling" | "count"): Promise<number> {
		const baselines = await this.getFourWeekBaselines();
		const baseline = baselines.get(normalizeGoalTag(scope));
		return (mode === "count" ? baseline?.count : baseline?.hours) ?? 0;
	}

	async getFourWeekBaselines(): Promise<Map<string, { hours: number; count: number }>> {
		const tasks = await this.plugin.cacheManager.getAllTasks();
		const end = new Date();
		const start = new Date(end);
		start.setDate(start.getDate() - 28);
		return buildFourWeekGoalBaselines(buildTimeStatisticsSegments(tasks, { start, end }, end));
	}

	private async getMilestoneHours(
		goal: GoalDefinition,
		since: Date,
		until: Date
	): Promise<number> {
		const tasks = await this.plugin.cacheManager.getAllTasks();
		const goals = await this.listGoals();
		const segments = buildTimeStatisticsSegments(tasks, { start: since, end: until }, until);
		const attributed = attributeGoalSegments(goals, segments);
		const paths = goal.mode
			? [goal.path]
			: goals.filter((item) => item.parent === goal.name).map((item) => item.path);
		return (
			paths
				.flatMap((path) => attributed.get(path) ?? [])
				.reduce((sum, item) => sum + item.durationMs, 0) / 3_600_000
		);
	}

	async updateMilestone(
		goalPath: string,
		milestoneIndex: number,
		value: number | true
	): Promise<{ achievedTier?: number; crossedTiers: number[] }> {
		const goal = await this.getGoal(goalPath);
		if (!goal) throw new Error("Goal not found.");
		const milestone = goal.milestones[milestoneIndex];
		if (!milestone) throw new Error("Milestone not found.");
		const today = new Date().toISOString().slice(0, 10);
		const until = new Date();
		const crossedTiers: number[] = [];

		if (milestone.kind === "boolean") {
			if (value !== true || milestone.achieved) return { crossedTiers };
			const hours = await this.getMilestoneHours(goal, new Date(goal.created), until);
			milestone.achieved = today;
			milestone.hours_at = Number(hours.toFixed(2));
		} else {
			if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
				throw new Error("Milestone value must be a non-negative number.");
			}
			const achieved = recordValue(milestone.achieved);
			const hoursAt = numberRecordValue(milestone.hours_at);
			for (const tier of milestone.tiers ?? []) {
				if (value < tier || achieved[String(tier)]) continue;
				const priorDates = Object.values(achieved).sort();
				const since = new Date(priorDates[priorDates.length - 1] ?? goal.created);
				const hours = await this.getMilestoneHours(goal, since, until);
				achieved[String(tier)] = today;
				hoursAt[String(tier)] = Number(hours.toFixed(2));
				crossedTiers.push(tier);
			}
			const previousValue = milestone.current ?? 0;
			milestone.current = value;
			milestone.achieved = achieved;
			milestone.hours_at = hoursAt;
			if (value !== previousValue) {
				const progressHistory = [...(milestone.progressHistory ?? [])];
				if (
					progressHistory.length === 0 &&
					previousValue > 0 &&
					milestone.updatedAt &&
					milestone.updatedAt !== today
				) {
					progressHistory.push({ date: milestone.updatedAt, value: previousValue });
				}
				const sameDayIndex = progressHistory.findIndex(
					(snapshot) => snapshot.date === today
				);
				const snapshot = { date: today, value };
				if (sameDayIndex >= 0) progressHistory[sameDayIndex] = snapshot;
				else progressHistory.push(snapshot);
				milestone.progressHistory = progressHistory.sort((left, right) =>
					left.date.localeCompare(right.date)
				);
			}
		}
		milestone.updatedAt = today;

		const file = this.plugin.app.vault.getAbstractFileByPath(goal.path);
		if (!(file instanceof TFile)) throw new Error("Goal file not found.");
		await processVaultFrontMatter(this.plugin.app, file, (frontmatter) => {
			const milestones = Array.isArray(frontmatter.milestones)
				? [...frontmatter.milestones]
				: [];
			milestones[milestoneIndex] = encodeMilestone(milestone);
			frontmatter.milestones = milestones;
		});
		return { achievedTier: crossedTiers[crossedTiers.length - 1], crossedTiers };
	}

	async undoMilestoneAchievement(
		goalPath: string,
		milestoneIndex: number,
		tier?: number
	): Promise<void> {
		const goal = await this.getGoal(goalPath);
		if (!goal) throw new Error("Goal not found.");
		const milestone = goal.milestones[milestoneIndex];
		if (!milestone) throw new Error("Milestone not found.");
		if (milestone.kind === "boolean") {
			milestone.achieved = null;
			milestone.hours_at = null;
		} else if (tier !== undefined) {
			const achieved = recordValue(milestone.achieved);
			const hoursAt = numberRecordValue(milestone.hours_at);
			delete achieved[String(tier)];
			delete hoursAt[String(tier)];
			milestone.achieved = achieved;
			milestone.hours_at = hoursAt;
		}
		milestone.updatedAt = new Date().toISOString().slice(0, 10);
		const file = this.plugin.app.vault.getAbstractFileByPath(goal.path);
		if (!(file instanceof TFile)) throw new Error("Goal file not found.");
		await processVaultFrontMatter(this.plugin.app, file, (frontmatter) => {
			const milestones = Array.isArray(frontmatter.milestones)
				? [...frontmatter.milestones]
				: [];
			milestones[milestoneIndex] = encodeMilestone(milestone);
			frontmatter.milestones = milestones;
		});
	}
}
