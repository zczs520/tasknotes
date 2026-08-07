import fs from "node:fs";
import path from "node:path";
import { stringify } from "yaml";

const vaultArg = process.argv[2];
if (!vaultArg) {
	throw new Error("Usage: node scripts/generate-demo-vault.mjs <vault-path>");
}

const vaultPath = path.resolve(vaultArg);
const demoDir = path.join(vaultPath, "TaskNotes", "Tasks", "演示数据");
const projectsDir = path.join(vaultPath, "TaskNotes", "Projects");
const expectedSuffix = path.join("TaskNotes", "Tasks", "演示数据");
if (!demoDir.startsWith(`${vaultPath}${path.sep}`) || !demoDir.endsWith(expectedSuffix)) {
	throw new Error(`Refusing to write outside the demo task folder: ${demoDir}`);
}

const anchor = process.env.TASKNOTES_DEMO_DATE
	? new Date(`${process.env.TASKNOTES_DEMO_DATE}T12:00:00`)
	: new Date();

function addDays(date, days) {
	const copy = new Date(date);
	copy.setDate(copy.getDate() + days);
	return copy;
}

function dateOnly(date) {
	const year = date.getFullYear();
	const month = String(date.getMonth() + 1).padStart(2, "0");
	const day = String(date.getDate()).padStart(2, "0");
	return `${year}-${month}-${day}`;
}

function dateTime(date, hour, minute = 0) {
	return `${dateOnly(date)}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function iso(date) {
	return date.toISOString();
}

function safeFileName(value) {
	return value.replace(/[<>:"/\\|?*]/g, "-").replace(/\s+/g, " ").trim();
}

function writeMarkdown(targetPath, frontmatter, body) {
	fs.mkdirSync(path.dirname(targetPath), { recursive: true });
	const yaml = stringify(frontmatter, { lineWidth: 0 }).trimEnd();
	fs.writeFileSync(targetPath, `---\n${yaml}\n---\n\n${body.trim()}\n`, "utf8");
}

fs.rmSync(demoDir, { recursive: true, force: true });
fs.mkdirSync(demoDir, { recursive: true });
fs.mkdirSync(projectsDir, { recursive: true });

const projects = [
	{
		name: "官网增长计划",
		tag: "增长",
		color: "蓝色",
		titles: [
			"重写首页核心价值主张", "设计免费试用转化漏斗", "整理 SEO 关键词集群", "制作产品功能对比页",
			"优化移动端购买流程", "接入关键事件分析", "准备客户案例页面", "检查站点结构化数据",
			"更新定价页常见问题", "分析落地页跳出原因", "发布八月增长实验", "复盘自然搜索流量",
		],
	},
	{
		name: "联盟产品升级",
		tag: "产品",
		color: "紫色",
		titles: [
			"梳理品牌主入驻流程", "优化推广员邀请体验", "设计佣金规则配置", "补充多币种结算说明",
			"验收团队权限控制", "完善提现异常提示", "整理客户反馈优先级", "绘制新版数据概览",
			"准备产品培训材料", "验证移动端核心流程", "确认新版本发布范围", "同步运营后台字段",
		],
	},
	{
		name: "内容与品牌",
		tag: "内容",
		color: "橙色",
		titles: [
			"制定本月内容主题", "录制产品演示视频", "编写新用户快速入门", "整理社交媒体素材",
			"制作功能更新长图", "采访一位种子用户", "撰写自动化工作流案例", "设计每周内容复盘模板",
			"更新品牌视觉规范", "准备发布公告", "规划教程视频脚本", "整理常见问题素材库",
		],
	},
	{
		name: "个人效率系统",
		tag: "效率",
		color: "绿色",
		titles: [
			"规划本周三个关键结果", "清理收件箱和待处理事项", "整理项目复盘笔记", "安排两段深度工作时间",
			"回顾本月时间投入", "优化每日启动清单", "建立会议记录模板", "整理待读资料",
			"设置季度目标看板", "复盘任务延期原因", "归档已完成项目", "规划下周工作节奏",
		],
	},
];

const projectLinks = new Map();
projects.forEach((project, projectIndex) => {
	const fileName = `${String(projectIndex + 1).padStart(2, "0")}-${project.name}.md`;
	const relativePath = `TaskNotes/Tasks/演示数据/${fileName.slice(0, -3)}`;
	projectLinks.set(project.name, `[[${relativePath}|${project.name}]]`);
	writeMarkdown(
		path.join(demoDir, fileName),
		{
			title: project.name,
			status: projectIndex === 3 ? "open" : "in-progress",
			priority: projectIndex < 2 ? "high" : "normal",
			scheduled: dateOnly(addDays(anchor, -projectIndex)),
			due: dateOnly(addDays(anchor, 18 + projectIndex * 5)),
			contexts: ["规划"],
			timeEstimate: 480,
			dateCreated: iso(addDays(anchor, -45 - projectIndex * 8)),
			dateModified: iso(addDays(anchor, -projectIndex)),
			tags: ["task", "项目", project.tag],
		},
		`# ${project.name}\n\n这是用于展示 TaskNotes 项目进度、关联任务和时间统计能力的示例项目。\n\n## 目标\n\n- 聚焦最重要的交付结果\n- 持续记录推进过程\n- 使用关联任务自动计算完成进度`
	);
});

const statusCycle = ["done", "in-progress", "open", "done", "open", "in-progress"];
const priorityCycle = ["high", "normal", "low", "normal", "high", "normal"];
const contexts = ["深度工作", "办公室", "会议", "随时", "电脑"];
let taskNumber = projects.length + 1;

projects.forEach((project, projectIndex) => {
	project.titles.forEach((title, index) => {
		const status = statusCycle[(index + projectIndex) % statusCycle.length];
		const priority = priorityCycle[(index + projectIndex * 2) % priorityCycle.length];
		const dayOffset = status === "done" ? -42 + index * 3 + projectIndex : -2 + index * 2;
		const scheduledDate = addDays(anchor, dayOffset);
		const dueDate = addDays(scheduledDate, priority === "high" ? 1 : 3);
		const timeEstimate = [30, 45, 60, 90, 120][(index + projectIndex) % 5];
		const timeEntries = [];
		if (status !== "open") {
			const firstStart = new Date(scheduledDate);
			firstStart.setHours(9 + ((index + projectIndex) % 6), index % 2 ? 30 : 0, 0, 0);
			const firstEnd = new Date(firstStart.getTime() + Math.min(timeEstimate, 70) * 60_000);
			timeEntries.push({ startTime: iso(firstStart), endTime: iso(firstEnd) });
			if (timeEstimate >= 90) {
				const secondStart = new Date(firstStart.getTime() + 24 * 60 * 60_000);
				secondStart.setHours(14, 0, 0, 0);
				const secondEnd = new Date(secondStart.getTime() + 45 * 60_000);
				timeEntries.push({ startTime: iso(secondStart), endTime: iso(secondEnd) });
			}
		}

		const frontmatter = {
			title,
			status,
			priority,
			scheduled: dateTime(scheduledDate, 8 + ((index + projectIndex) % 9), index % 2 ? 30 : 0),
			due: dateTime(dueDate, 18),
			contexts: [contexts[(index + projectIndex) % contexts.length]],
			projects: [projectLinks.get(project.name)],
			timeEstimate,
			dateCreated: iso(addDays(scheduledDate, -7)),
			dateModified: iso(addDays(anchor, status === "done" ? -Math.max(1, 15 - index) : 0)),
			tags: ["task", project.tag, index % 3 === 0 ? "重点" : "执行"],
		};
		if (timeEntries.length) frontmatter.timeEntries = timeEntries;
		if (status === "done") frontmatter.completedDate = dateOnly(addDays(dueDate, -1));
		if (index === 2 && projectIndex === 1) {
			frontmatter.blockedBy = [{ uid: projectLinks.get("官网增长计划"), reltype: "FINISHTOSTART" }];
		}

		const fileName = `${String(taskNumber).padStart(2, "0")}-${safeFileName(title)}.md`;
		taskNumber += 1;
		writeMarkdown(
			path.join(demoDir, fileName),
			frontmatter,
			`# ${title}\n\n## 交付标准\n\n- 完成核心内容或设计\n- 与相关成员确认结果\n- 将结论同步到项目记录\n\n## 工作记录\n\n这是为产品演示准备的合成任务数据，不包含真实个人信息。`
		);
	});
});

const routines = [
	["每日计划与收尾", "FREQ=DAILY;BYDAY=MO,TU,WE,TH,FR", 9, "效率"],
	["每周产品进度同步", "FREQ=WEEKLY;BYDAY=MO", 10, "产品"],
	["每周数据复盘", "FREQ=WEEKLY;BYDAY=FR", 16, "增长"],
	["每月内容选题会", "FREQ=MONTHLY;BYDAY=1MO", 14, "内容"],
	["检查客户反馈看板", "FREQ=WEEKLY;BYDAY=WE", 11, "客户"],
	["整理本周成果", "FREQ=WEEKLY;BYDAY=FR", 17, "效率"],
	["学习与资料整理", "FREQ=WEEKLY;BYDAY=SA", 10, "学习"],
	["季度目标回顾", "FREQ=MONTHLY;INTERVAL=3", 15, "规划"],
];

routines.forEach(([title, recurrence, hour, tag], index) => {
	writeMarkdown(
		path.join(demoDir, `${String(taskNumber + index).padStart(2, "0")}-${title}.md`),
		{
			title,
			status: "open",
			priority: index < 3 ? "normal" : "low",
			scheduled: dateTime(addDays(anchor, index % 5), hour),
			recurrence,
			timeEstimate: index % 2 ? 45 : 30,
			contexts: [index % 2 ? "会议" : "规划"],
			dateCreated: iso(addDays(anchor, -70)),
			dateModified: iso(anchor),
			tags: ["task", "例行", tag],
		},
		`# ${title}\n\n持续执行并在每次完成后记录关键结论。`
	);
});

const settingsPath = path.join(vaultPath, ".obsidian", "plugins", "ccctasknote", "data.json");
if (fs.existsSync(settingsPath)) {
	const settings = JSON.parse(fs.readFileSync(settingsPath, "utf8"));
	settings.uiLanguage = "zh";
	settings.calendarViewSettings = {
		...(settings.calendarViewSettings ?? {}),
		defaultShowTimeEntries: true,
		defaultShowScheduled: true,
		defaultShowDue: true,
		defaultView: "timeGridWeek",
		slotMinTime: "07:00:00",
		slotMaxTime: "21:00:00",
	};
	const statusLabels = { none: "无状态", open: "待处理", "in-progress": "进行中", done: "已完成" };
	settings.customStatuses = (settings.customStatuses ?? []).map((status) => ({
		...status,
		label: statusLabels[status.value] ?? status.label,
	}));
	const priorityLabels = { none: "无", low: "低", normal: "普通", high: "高" };
	settings.customPriorities = (settings.customPriorities ?? []).map((priority) => ({
		...priority,
		label: priorityLabels[priority.value] ?? priority.label,
	}));
	fs.writeFileSync(settingsPath, `${JSON.stringify(settings, null, 2)}\n`, "utf8");
}

const summaryPath = path.join(vaultPath, "TaskNotes", "演示数据说明.md");
writeMarkdown(
	summaryPath,
	{ tags: ["tasknotes-demo"] },
	`# TaskNotes 演示数据\n\n已生成 ${projects.length + projects.reduce((sum, project) => sum + project.titles.length, 0) + routines.length} 个合成任务。\n\n这些内容只用于截图、GIF 和功能演示，不包含真实个人信息。`
);

const showcaseViewsDir = path.join(vaultPath, "TaskNotes", "Views", "Showcase");
fs.mkdirSync(showcaseViewsDir, { recursive: true });
const showcaseFilter = `filters:\n  and:\n    - file.hasTag("task")\n    - file.folder == "TaskNotes/Tasks/演示数据"`;
const sharedOrder = `    order:\n      - status\n      - priority\n      - due\n      - scheduled\n      - projects\n      - contexts\n      - file.tags\n      - file.name`;
const views = {
	"showcase-kanban.base": `${showcaseFilter}\nviews:\n  - type: tasknotesKanban\n    name: 项目看板\n    groupBy:\n      property: status\n      direction: ASC\n${sharedOrder}\n    options:\n      boardFullWidth: true\n      columnWidth: 300\n      hideEmptyColumns: true\n`,
	"showcase-tasks.base": `${showcaseFilter}\nviews:\n  - type: tasknotesTaskList\n    name: 任务总览\n    groupBy:\n      property: status\n      direction: ASC\n${sharedOrder}\n`,
	"showcase-calendar.base": `${showcaseFilter}\nviews:\n  - type: tasknotesCalendar\n    name: 工作日历\n${sharedOrder}\n    options:\n      showScheduled: true\n      showDue: true\n      showRecurring: true\n      showTimeEntries: true\n      calendarView: timeGridWeek\n      slotMinTime: 07:00:00\n      slotMaxTime: 21:00:00\n      slotDuration: 00:30:00\n`,
	"showcase-statistics.base": `${showcaseFilter}\nviews:\n  - type: tasknotesTimeStatistics\n    name: 时间统计\n${sharedOrder}\n`,
};
for (const [fileName, content] of Object.entries(views)) {
	fs.writeFileSync(path.join(showcaseViewsDir, fileName), content, "utf8");
}

console.log(`Generated ${projects.length + projects.reduce((sum, project) => sum + project.titles.length, 0) + routines.length} demo tasks in ${demoDir}`);
