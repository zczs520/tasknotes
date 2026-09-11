import { TFile, normalizePath, type App } from "obsidian";
import type { TaskNotesSettings } from "../types/settings";
import { ensureFolderHierarchy } from "./defaultBasesFiles";

export const STARTER_NOTE_ENGLISH_PATH = "TASKquence/Start Here.md";
export const STARTER_NOTE_CHINESE_PATH = "TASKquence/开始使用.md";

export const STARTER_NOTE_ENGLISH_CONTENT = `# Welcome to TASKquence

> 中文版：[[TASKquence/开始使用|开始使用]]

Start with three actions: **Create new task**, **Open Kanban board**, and **Open time statistics**. Your tasks stay ordinary Markdown notes in your Obsidian vault.

## Set up once

1. Enable **Bases** in Obsidian → Settings → Core plugins.
2. Create a task from the plus icon on the ribbon or the TASKquence command palette.
3. Open the Kanban icon to plan your work. Start a task timer, then open time statistics to review it.

New tasks go into **TASKquence/Tasks** by default. Each task has the property **taskType: task**; Kanban and time statistics use this same fixed identity. Tags are for organization, not task identification. To include an existing note, use **Convert current note to task** or add this property in the note's Properties section.

## Capture and plan

The task sheet creates a note immediately and saves edits automatically. Enter a title such as “Review the launch plan tomorrow at 3pm #planning”, then adjust its status, planned date and tags.

Drag tasks between status columns. Tags create horizontal swimlanes, and new tags appear automatically. Use search and the date filter to narrow the board. The menu beside a status title edits its name, color, icon and completion behavior for all boards.

Read [[TASKquence/Kanban Guide|the Kanban guide]] for setup, filters, swimlanes and troubleshooting.

## Track and review

Start and stop a task timer from a card or task note. Open time statistics for daily timelines, weekly/monthly/yearly totals and individual records. A task needs recorded time to contribute to statistics. Timeline blocks and labels share the task's tag color.

## Optional views

Task lists, calendars, agenda, Pomodoro and relationship views start disabled. Enable what you need in **Settings → TASKquence → General → Views & base files**. Enabling a view adds its shortcuts and creates its Base file when applicable. Disabling it removes shortcuts and stops automatic file creation; existing notes and Base files are retained.

Default active views:
- [[TASKquence/Views/kanban-default.base|Kanban]]
- [[TASKquence/Views/time-statistics.base|Time statistics]]

You can change their file paths in settings, or embed a Base by adding ! before its wiki link.

## Use TASKquence on iPhone

Read [[TASKquence/Tasks/App/TASKquence iOS|the iOS companion guide]] for download and pairing instructions.

## Help

[Source and issue tracker](https://github.com/zczs520/tasknotes)
`;

export const STARTER_NOTE_CHINESE_CONTENT = `# 欢迎使用 TASKquence

> English: [[TASKquence/Start Here|Start Here]]

从三个入口开始：**创建新任务、看板、时间统计**。所有任务都是 Obsidian 仓库里的普通 Markdown 笔记。

## 第一次使用

1. 在 **Obsidian → 设置 → 核心插件** 中启用 **Bases（数据库）**。
2. 点击左侧功能区的加号，或在命令面板运行 **TASKquence: 创建新任务**。
3. 点击看板图标安排任务；启动一次任务计时，再打开时间统计查看记录。

新任务默认保存在 **TASKquence/Tasks**。每个任务都包含 **taskType: task** 属性；看板和时间统计固定使用同一条识别规则，标签仅用于分类。要纳入已有笔记，可运行 **将当前笔记转换为任务**，或在笔记属性区添加 taskType 并设为 task。

## 创建和安排任务

任务窗口打开时就会创建笔记，后续修改自动保存。试着输入“明天下午3点准备发布计划 #工作”，再调整状态、计划日期和标签。

拖动卡片可修改状态。标签会形成横向泳道，新标签默认显示。使用顶部搜索框和日期筛选缩小范围。点击状态标题旁的菜单，可以修改名称、颜色、图标和完成状态；更改会同步到插件设置与其他看板。

详细操作请阅读 [[TASKquence/看板使用说明|看板使用说明]]，包括泳道、筛选、状态和常见问题。

## 计时与复盘

在任务卡片或任务笔记中开始、停止计时。时间统计支持当日时间轴，以及周、月、年汇总和逐条记录。任务有计时记录后才会贡献统计时长。时间轴色块与任务标签文字使用相同颜色。

## 按需开启更多视图

任务列表、日历、议程、番茄钟和关系视图默认关闭。在 **设置 → TASKquence → 常规 → 视图与 Base 文件** 中开启需要的功能。开启后添加快捷入口，并创建适用的 Base 文件；关闭后移除入口并停止自动生成文件，已有笔记和 Base 文件会保留。

默认启用的视图：
- [[TASKquence/Views/kanban-default.base|看板]]
- [[TASKquence/Views/time-statistics.base|时间统计]]

可在设置里修改文件路径，也可以在上述双链前加上 ! 将视图嵌入笔记。

## 搭配 iPhone 使用

阅读 [[TASKquence/Tasks/App/TASKquence iOS 中文指南|iOS 下载与配套使用指南]]。

## 获取帮助

[源码与问题反馈](https://github.com/zczs520/tasknotes)
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
