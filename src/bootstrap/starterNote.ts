import { TFile, normalizePath, type App } from "obsidian";
import type { TaskNotesSettings } from "../types/settings";
import { ensureFolderHierarchy } from "./defaultBasesFiles";

export const STARTER_NOTE_ENGLISH_PATH = "TaskNotes/Start Here.md";
export const STARTER_NOTE_CHINESE_PATH = "TaskNotes/开始使用.md";

export const STARTER_NOTE_ENGLISH_CONTENT = `# Welcome to TASKquence

> 中文版：[[开始使用]]

TASKquence is an independent TaskNotes fork for planning work and life in Obsidian. It combines Markdown tasks, Bases-powered views, calendars, Pomodoro, time tracking, visual statistics, and TASKquence iOS life-event sync.

Your tasks remain ordinary Markdown notes in your vault. TASKquence adds a faster way to capture, plan, focus, and review them without locking your data into a separate database.

## Before you start

- [ ] Enable Obsidian's **Bases** core plugin.
- [ ] Confirm the default \`.base\` files exist in \`TaskNotes/Views/\`.
- [ ] Open the command palette and run **TASKquence: Open tasks view**.

If a default view is missing, go to **Settings → TASKquence → General → Views & base files → Create files**.

## 1. Capture a task in seconds

Run **TASKquence: Create new task**. The task note is created immediately and every edit is autosaved, so you can close the sheet or open the note without a separate save step.

Natural-language capture can fill dates, contexts, and tags while you type. For example:

\`\`\`text
Review the launch plan tomorrow at 3pm @office #planning
\`\`\`

Use the compact property controls for status, priority, scheduled date, tags, projects, recurrence, reminders, estimates, and other fields. Select **Open note** whenever you want the full Markdown file.

## 2. Plan visually

Open **TASKquence: Open Kanban board** to move tasks through your workflow. The redesigned board includes color-coded columns, task search, date filters, configurable swimlanes, quick scheduled-date changes, and task creation that inherits the current column and swimlane.

The default Bases views are ready to embed in dashboards, daily notes, or project notes:

- \`![[TaskNotes/Views/tasks-default.base]]\` — task list
- \`![[TaskNotes/Views/agenda-default.base]]\` — agenda
- \`![[TaskNotes/Views/mini-calendar-default.base]]\` — compact calendar
- \`![[TaskNotes/Views/calendar-default.base]]\` — day, week, month, and year planning
- \`![[TaskNotes/Views/kanban-default.base]]\` — status workflow

## 3. Focus and track time

Start a task timer from a task card or task note. The floating active-task control keeps elapsed time and the Stop/Complete actions visible while you work. Moving a task into the configured in-progress status can start tracking automatically; moving it out stops the timer.

Use Pomodoro for focus sessions, then open **TASKquence: Open time statistics** to review day, week, month, or year totals, timelines, heatmaps, task rankings, tag distribution, and individual time entries.

## 4. Connect plans with your life

Use calendars and recurring tasks to combine scheduled work, due dates, time blocks, and external events. TASKquence can sync life events with the TASKquence iOS experience when that companion sync is configured, while your task source of truth stays in the vault.

## 5. Make the system yours

Every task property is configurable. Add fields such as \`energy\`, \`client\`, or \`area\`, then use them directly in Obsidian Bases filters, sorting, grouping, formulas, and swimlanes.

Try these next:

- Create one real task and start its timer.
- Drag it between Kanban columns and change its scheduled date from the card.
- Duplicate a default Base and filter it to one project or tag.
- Open the time statistics dashboard after recording a few sessions.

## Help and project links

- TASKquence source and issues: [github.com/zczs520/tasknotes](https://github.com/zczs520/tasknotes)
- Upstream TaskNotes documentation: [tasknotes.dev](https://tasknotes.dev/)

TASKquence is an independent fork. Some upstream documentation and integrations may describe the original TaskNotes release and differ from this version.

## You're ready

Capture what matters, decide when it belongs, focus on one thing, and use the review views to improve the next cycle.
`;

export const STARTER_NOTE_CHINESE_CONTENT = `# 欢迎使用 TASKquence

> English guide: [[Start Here]]

TASKquence 是一个独立维护的 TaskNotes 分支，面向在 Obsidian 中规划工作与生活的用户。它把 Markdown 任务、Bases 视图、日历、番茄钟、时间追踪、可视化统计和 TASKquence iOS 生活事件同步整合在一起。

所有任务仍然是保存在你仓库里的普通 Markdown 笔记。TASKquence 只是在此基础上提供更顺手的捕捉、规划、专注与复盘体验，不会把数据锁进独立数据库。

## 开始前

- [ ] 启用 Obsidian 核心插件 **Bases（数据库）**。
- [ ] 确认 \`TaskNotes/Views/\` 中已经生成默认的 \`.base\` 文件。
- [ ] 打开命令面板，运行 **TASKquence: 打开任务视图**。

如果缺少默认视图，请前往 **设置 → TASKquence → 常规 → 视图与 Base 文件 → 创建文件**。

## 1. 快速捕捉任务

运行 **TASKquence: 创建新任务**。任务笔记会在窗口打开时立即创建，之后的每次修改都会自动保存；关闭窗口或直接打开笔记时，不需要再点一次“保存”。

自然语言输入可以自动识别日期、场景和标签，例如：

\`\`\`text
明天下午3点@家买杂货 #差事
\`\`\`

你可以在紧凑的属性区设置状态、优先级、计划日期、标签、项目、重复规则、提醒、预估时间等字段；需要完整编辑时，点击左上角的 **打开笔记**。

## 2. 用看板和日历规划

运行 **TASKquence: 打开看板**，把任务拖动到不同状态。新版看板提供柔和的彩色列、任务搜索、日期筛选、可配置泳道、卡片内快速改期，以及继承当前列和泳道属性的新建任务。

默认 Bases 视图可以直接嵌入主页、日记或项目笔记：

- \`![[TaskNotes/Views/tasks-default.base]]\` — 任务列表
- \`![[TaskNotes/Views/agenda-default.base]]\` — 日程
- \`![[TaskNotes/Views/mini-calendar-default.base]]\` — 迷你日历
- \`![[TaskNotes/Views/calendar-default.base]]\` — 日、周、月、年计划
- \`![[TaskNotes/Views/kanban-default.base]]\` — 状态看板

## 3. 专注并记录时间

从任务卡片或任务笔记启动计时。可拖动的悬浮任务控件会一直显示当前任务、已用时间，以及“停止”和“完成”操作。任务进入设定的“进行中”状态时可以自动开始计时，移出该状态时会自动停止。

你也可以使用番茄钟安排专注周期。记录一段时间后，运行 **TASKquence: 打开时间统计**，从日、周、月、年四个尺度查看时间线、热力图、任务排行、标签分布和每条计时记录。

## 4. 连接计划与生活事件

通过日历和重复任务统一管理计划日期、截止日期、时间块与外部日历事件。配置配套同步后，TASKquence 还可以与 TASKquence iOS 的生活事件保持同步，同时继续以 Obsidian 仓库作为任务数据源。

## 5. 调整成你的系统

任务属性可以自由配置。你可以添加 \`energy\`、\`client\`、\`area\` 等字段，并直接在 Obsidian Bases 中筛选、排序、分组、计算或用作看板泳道。

接下来可以尝试：

- 创建一个真实任务并启动计时。
- 在看板中拖动任务，并从卡片直接修改计划日期。
- 复制一个默认 Base，只显示某个项目或标签。
- 记录几次专注时间后打开时间统计面板复盘。

## 帮助与项目链接

- TASKquence 源码与问题反馈：[github.com/zczs520/tasknotes](https://github.com/zczs520/tasknotes)
- 上游 TaskNotes 文档：[tasknotes.dev](https://tasknotes.dev/)

TASKquence 是独立维护的分支。上游文档和集成说明对应原版 TaskNotes，部分内容可能与本版本不同。

## 可以开始了

捕捉重要的事，决定它应该在什么时候发生，专注完成一件事，再通过统计和视图改进下一轮计划。
`;

// Backward-compatible exports for callers and third-party tests that referenced the original note.
export const STARTER_NOTE_PATH = STARTER_NOTE_ENGLISH_PATH;
export const STARTER_NOTE_CONTENT = STARTER_NOTE_ENGLISH_CONTENT;

const STARTER_NOTES = [
	{ path: STARTER_NOTE_ENGLISH_PATH, content: STARTER_NOTE_ENGLISH_CONTENT, locale: "en" },
	{ path: STARTER_NOTE_CHINESE_PATH, content: STARTER_NOTE_CHINESE_CONTENT, locale: "zh" },
] as const;

export type StarterNoteResult =
	| "created"
	| "opened-existing"
	| "already-created"
	| "not-first-install"
	| "path-not-file"
	| "failed";

export type StarterNoteHost = {
	app: Pick<App, "vault" | "workspace">;
	settings: Pick<TaskNotesSettings, "starterNoteCreated">;
	shouldCreateStarterNote: boolean;
	uiLocale?: string;
	saveSettings(): Promise<void>;
	warn?(message: string, error?: unknown): void;
};

function prefersChinese(locale?: string): boolean {
	return locale?.toLowerCase().split("-")[0] === "zh";
}

export async function ensureStarterNote(host: StarterNoteHost): Promise<StarterNoteResult> {
	if (host.settings.starterNoteCreated) {
		return "already-created";
	}

	if (!host.shouldCreateStarterNote) {
		return "not-first-install";
	}

	try {
		const vault = host.app.vault;
		const availableFiles = new Map<string, TFile>();
		let createdAny = false;

		for (const note of STARTER_NOTES) {
			const normalizedPath = normalizePath(note.path);
			const existing = await vault.adapter.exists(normalizedPath);
			if (existing) {
				const existingFile = vault.getAbstractFileByPath(normalizedPath);
				if (existingFile instanceof TFile) {
					availableFiles.set(note.locale, existingFile);
				} else {
					host.warn?.(
						`[TASKquence][StarterNote] Starter note path exists but is not a file: ${normalizedPath}`
					);
				}
				continue;
			}

			const lastSlashIndex = normalizedPath.lastIndexOf("/");
			const directory =
				lastSlashIndex >= 0 ? normalizedPath.substring(0, lastSlashIndex) : "";
			if (directory) {
				await ensureFolderHierarchy(vault, directory);
			}
			const file = await vault.create(normalizedPath, note.content);
			availableFiles.set(note.locale, file);
			createdAny = true;
		}

		const preferredLocale = prefersChinese(host.uiLocale) ? "zh" : "en";
		const fallbackLocale = preferredLocale === "zh" ? "en" : "zh";
		const file = availableFiles.get(preferredLocale) ?? availableFiles.get(fallbackLocale);
		if (!file) {
			return "path-not-file";
		}

		host.settings.starterNoteCreated = true;
		await host.saveSettings();
		await host.app.workspace.getLeaf("tab").openFile(file);
		return createdAny ? "created" : "opened-existing";
	} catch (error) {
		host.warn?.("[TASKquence][StarterNote] Failed to create starter notes:", error);
		return "failed";
	}
}
