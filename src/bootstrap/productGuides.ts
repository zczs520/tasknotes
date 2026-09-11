import {
	STARTER_NOTE_ENGLISH_PATH,
	STARTER_NOTE_ENGLISH_CONTENT,
	STARTER_NOTE_CHINESE_PATH,
	STARTER_NOTE_CHINESE_CONTENT,
} from "./starterNote";
import type { App } from "obsidian";
import { ensureFolderHierarchy } from "./defaultBasesFiles";

export const PRODUCT_GUIDES = [
	{ path: STARTER_NOTE_ENGLISH_PATH, content: STARTER_NOTE_ENGLISH_CONTENT },
	{ path: STARTER_NOTE_CHINESE_PATH, content: STARTER_NOTE_CHINESE_CONTENT },
	{
		path: "TASKquence/看板使用说明.md",
		content: `# TASKquence 看板使用说明

> English: [[TASKquence/Kanban Guide|Kanban Guide]] · [[TASKquence/开始使用|返回入门指南]]

## 打开你的第一个看板

启用 Obsidian 核心插件 Bases 后，点击左侧看板图标，或运行“TASKquence: 打开看板”。默认文件是 [[TASKquence/Views/kanban-default.base]]。缺少文件时，在“设置 → TASKquence → 常规 → 视图与 Base 文件”中开启看板并点击“创建文件”。

## 哪些笔记会出现在这里

任务必须具有 taskType 属性，值为 task。插件创建的任务会自动填写；已有笔记可通过“将当前笔记转换为任务”加入。标签不是任务识别条件。看板和时间统计共用此规则。

## 列、状态与卡片

- 列默认按状态分组；拖动任务到另一列会修改任务状态。
- 点击状态名称旁的 ⋯，选择“编辑状态”，修改显示名称、颜色、图标或是否表示完成。更改直接保存到插件设置，对其他看板也有效。
- “删除状态”会删除全局状态配置，保留任务笔记及其原状态值。原状态任务可能显示在未配置状态列中，可拖动到其他状态重新归类。至少保留一个状态。
- 在列或泳道中创建任务，会继承所在位置的状态与分类。点击卡片可打开任务窗口修改日期和其他属性。

## 泳道：按标签横向分类

默认泳道属性是 tags。例如为任务添加“工作”或“学习”标签后，会出现对应泳道。新泳道默认显示。打开看板视图配置可更换泳道属性，或在“显示泳道”中隐藏某一项；隐藏仅影响显示，不删除任务。多个标签的任务可能出现在多个位置，它们是同一个任务。

## 搜索、日期筛选与显示配置

搜索框和时间筛选默认开启。使用日期筛选选择关注的时间范围；找不到任务时，先清空搜索并检查日期范围与隐藏泳道。

打开看板的视图配置，可调整泳道属性、列宽、看板宽度及其他显示选项。“在多个列中显示同一项目”和“仅在列标题中显示状态图标”默认开启，也可按需关闭。状态按插件设置里的顺序排列，可拖动列标题调整看板顺序。

## 计时和时间统计

从任务卡片启动、停止计时，再打开 [[TASKquence/Views/time-statistics.base|时间统计]] 查看记录。相同标签使用一致颜色。没有计时记录的任务不会贡献统计时长。

## 常见问题

- **看板为空**：确认任务有 taskType: task、未被排除文件夹设置过滤，并检查 Base 筛选、搜索、日期和隐藏泳道。
- **新标签没有出现**：确认笔记是任务，且没有手动隐藏该泳道。
- **修改列名后其他看板也变化**：状态编辑修改的是全局配置；每个看板的筛选、宽度和泳道设置仍独立保存。
- **需要日历或任务列表**：在“视图与 Base 文件”中开启对应功能。默认只启用看板和时间统计。
- **关闭视图后文件仍在**：已有文件保留以便恢复和保留个人配置，不会继续自动创建已关闭的视图文件。
`,
	},
	{
		path: "TASKquence/Kanban Guide.md",
		content: `# TASKquence Kanban guide

> 中文：[[TASKquence/看板使用说明]] · [[TASKquence/Start Here|Getting started]]

## Open your board

Enable Obsidian's Bases core plugin, then use the ribbon's Kanban icon or “TASKquence: Open Kanban board”. The default file is [[TASKquence/Views/kanban-default.base]]. If missing, enable Kanban under Settings → TASKquence → General → Views & base files and select Create files.

## Which notes appear?

A task must have the property taskType set to task. New tasks get this automatically. Use “Convert current note to task” for an existing note. Tags organize tasks; they do not identify them. Time statistics uses the same fixed task identity.

## Columns and statuses

Columns group tasks by status. Drag a task to another column to change its status. The ⋯ menu beside a status title lets you edit its display name, color, icon and completion behavior. Changes are saved directly to plugin settings and apply to all boards.

Deleting a status removes its global configuration but keeps task notes and their stored status values. Those tasks may appear in an unconfigured-status column; drag them to a configured column to reassign them. At least one status must remain.

Create a task inside a column or swimlane to inherit its status and classification. Click a task card to edit dates and properties.

## Swimlanes

Swimlanes default to tags. Add a Work or Learning tag to a task to create a matching lane. Newly discovered lanes are visible automatically. In the view configuration, choose another swimlane property or hide individual lanes. Hiding does not delete tasks. A task with multiple tags may appear in several places; these are the same task.

## Search, dates and layout

Search and date filtering start enabled. Clear search and check the date range when a task seems missing. View configuration also controls board width, column width, swimlanes and display options. “Show items in multiple columns” and “Show status icon in header only” start enabled and can be turned off. Drag column headers to adjust board ordering.

## Time tracking

Start and stop a timer from a task card, then open [[TASKquence/Views/time-statistics.base|Time statistics]]. Shared tags use consistent colors. Tasks need time entries to contribute tracked duration.

## Troubleshooting

- Empty board: check taskType: task, excluded folders, Base filters, search, dates and hidden lanes.
- Missing new tag: check that the note is a task and the lane was not explicitly hidden.
- Renaming affects another board: statuses are global; each board's filters and layout remain independent.
- Need calendars or task lists: enable them under Views & base files. Only Kanban and time statistics start enabled.
- A disabled view's file still exists: existing files and personal edits are preserved. Disabled views no longer generate files automatically.
`,
	},
	{
		path: "TASKquence/Tasks/App/TASKquence iOS 中文指南.md",
		content: `# 在 iPhone 上使用 TASKquence

> English: [[TASKquence/Tasks/App/TASKquence iOS]] · [[TASKquence/开始使用|插件入门]]

TASKquence 提供 iOS 端，可与 Obsidian 插件搭配使用：在电脑上用看板安排任务、记录时间和查看统计，在 iPhone 上使用配套 App 管理日常事项。

## 下载

在 iPhone 的 App Store 中搜索 **TASKquence**，找到对应应用后下载。具体上架地区、系统要求和功能以 App Store 页面为准。

## 配合插件使用

1. 先在 Obsidian 创建一个任务，熟悉看板和计时。
2. 打开 iOS App，完成应用内的新手引导。
3. 如需让同一任务在两端使用，请按 iOS App 中提供的 Obsidian 接入或同步说明完成配置。仅安装两个应用不会自动连接仓库。
4. 用一个测试任务检查两端显示和更新，再开始日常使用。

插件任务默认位于 TASKquence/Tasks，并使用 taskType: task 识别。这个 App 文件夹存放说明文档，不是任务，不会混入看板或时间统计。

连接方式和可同步字段以 iOS App 当前提供的说明为准。[插件反馈](https://github.com/zczs520/tasknotes/issues)
`,
	},
	{
		path: "TASKquence/Tasks/App/TASKquence iOS.md",
		content: `# TASKquence on iPhone

> 中文：[[TASKquence/Tasks/App/TASKquence iOS 中文指南]] · [[TASKquence/Start Here|Plugin setup]]

TASKquence has an iOS companion you can use alongside the Obsidian plugin. Plan tasks, track time and review statistics on your computer, and use the companion app for everyday activity on iPhone.

## Download

Search for **TASKquence** in the App Store on your iPhone and download the matching app. Availability, system requirements and features are listed on its App Store page.

## Use both together

1. Create a task in Obsidian and try the board and timer.
2. Open the iOS app and complete its onboarding.
3. To use the same task on both devices, follow the Obsidian connection or sync instructions provided in the iOS app. Installing both apps does not automatically connect your vault.
4. Verify both devices with one test task before daily use.

Plugin tasks default to TASKquence/Tasks and use taskType: task for identification. This App folder holds documentation, not tasks, so these guides stay out of Kanban and time statistics.

Refer to the iOS app's current instructions for connection methods and supported fields. [Plugin feedback](https://github.com/zczs520/tasknotes/issues)
`,
	},
] as const;

export async function ensureProductGuides(app: Pick<App, "vault">): Promise<void> {
	for (const note of PRODUCT_GUIDES) {
		if (await app.vault.adapter.exists(note.path)) continue;
		await ensureFolderHierarchy(app.vault, note.path.substring(0, note.path.lastIndexOf("/")));
		await app.vault.create(note.path, note.content);
	}
}
