import { stringify } from "yaml";

export type ExampleNote = { path: string; content: string };

type ExampleTimeEntry = {
	startTime: string;
	endTime: string;
	description: string;
};

type ExampleTaskDefinition = {
	name: string;
	tag: string;
	body: string;
	sessionLabel: string;
	durationMinutes: number;
	entries: ExampleTimeEntry[];
};

function formatLocalDate(date: Date): string {
	return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(
		date.getDate()
	).padStart(2, "0")}`;
}

function addSession(
	task: ExampleTaskDefinition,
	date: Date,
	startMinute: number,
	durationMinutes: number,
	description = task.sessionLabel
): void {
	const start = new Date(
		date.getFullYear(),
		date.getMonth(),
		date.getDate(),
		0,
		Math.max(0, startMinute)
	);
	const end = new Date(start.getTime() + Math.max(1, durationMinutes) * 60_000);
	task.entries.push({
		startTime: start.toISOString(),
		endTime: end.toISOString(),
		description,
	});
}

function buildExampleTasks(now: Date): ExampleTaskDefinition[] {
	const tasks: ExampleTaskDefinition[] = [
		{
			name: "示例 Example 01 - 工作规划 Work Planning",
			tag: "工作-Work",
			sessionLabel: "推进重点工作 / Focused work",
			durationMinutes: 105,
			entries: [],
			body: "用这项任务体验工作计划、状态流转和时间投入排行。可以修改标题、日期或优先级，再在看板中拖动它。\n\nUse this task to explore planning, status changes and time rankings. Edit its title, date or priority, then move it on the Kanban board.",
		},
		{
			name: "示例 Example 02 - 学习进阶 Study and Learning",
			tag: "学习-Study",
			sessionLabel: "阅读与练习 / Reading and practice",
			durationMinutes: 65,
			entries: [],
			body: "记录阅读、课程和刻意练习。它展示学习标签如何出现在日、周、月统计中。\n\nTrack reading, courses and deliberate practice. This task shows how a study tag appears across daily, weekly and monthly statistics.",
		},
		{
			name: "示例 Example 03 - 创作输出 Creative Work",
			tag: "创作-Creation",
			sessionLabel: "写作与创作 / Writing and creating",
			durationMinutes: 80,
			entries: [],
			body: "用于写作、设计、视频或其他创作活动，帮助观察不同类型投入的颜色占比。\n\nUse this for writing, design, video or other creative work, and compare its color share with other activities.",
		},
		{
			name: "示例 Example 04 - 健身训练 Fitness Training",
			tag: "生活/健身-Fitness",
			sessionLabel: "健身训练 / Fitness training",
			durationMinutes: 50,
			entries: [],
			body: "用健身示例查看短时训练和规律习惯在热力图中的效果。\n\nUse this fitness example to see how shorter workouts and consistent habits appear in the heatmap.",
		},
		{
			name: "示例 Example 05 - 生活家务 Life and Home",
			tag: "生活/家务-Home",
			sessionLabel: "生活整理 / Home routine",
			durationMinutes: 35,
			entries: [],
			body: "用于整理、家务和生活安排，让统计不只包含工作和学习。\n\nUse this for organizing, chores and home routines so the statistics cover more than work and study.",
		},
		{
			name: "示例 Example 06 - 休闲娱乐 Leisure",
			tag: "生活/娱乐-Leisure",
			sessionLabel: "休闲与恢复 / Leisure and recovery",
			durationMinutes: 70,
			entries: [],
			body: "记录休闲、游戏、散步或外出，形成更完整的生活时间分布。\n\nTrack leisure, games, walks or outings to create a more complete picture of how time is spent.",
		},
	];

	// One session on every completed day of the current year. The weekly pattern
	// covers all six tags, while two extra work blocks create a realistic dominant
	// category similar to the reference dashboard.
	const firstDay = new Date(now.getFullYear(), 0, 1);
	const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
	const weekdayTask = [5, 0, 2, 1, 3, 0, 4]; // Sunday through Saturday
	let dayIndex = 0;
	for (const date = new Date(firstDay); date < today; date.setDate(date.getDate() + 1)) {
		const taskIndex = weekdayTask[date.getDay()];
		const task = tasks[taskIndex];
		const startMinute = 8 * 60 + ((dayIndex * 47 + taskIndex * 31) % (9 * 60));
		const duration = task.durationMinutes + ((dayIndex * 13) % 31) - 15;
		addSession(task, date, startMinute, duration);

		if (date.getDay() === 2 || date.getDay() === 4) {
			addSession(
				tasks[0],
				date,
				Math.min(startMinute + duration + 35, 20 * 60),
				55 + ((dayIndex * 17) % 36),
				"项目推进 / Project delivery"
			);
		}
		dayIndex += 1;
	}

	// Build a varied current-day timeline using only completed time. During the
	// first few minutes after midnight a single short entry is safer than inventing
	// future activity; otherwise all six categories are represented today.
	const minutesNow = now.getHours() * 60 + now.getMinutes();
	const availableEnd = Math.max(1, minutesNow - 5);
	const todayTaskCount = availableEnd >= 18 ? tasks.length : 1;
	const visibleSpan = Math.min(8 * 60, availableEnd);
	const timelineStart = availableEnd - visibleSpan;
	const slotSize = Math.max(1, Math.floor(visibleSpan / todayTaskCount));
	for (let index = 0; index < todayTaskCount; index += 1) {
		const startMinute = timelineStart + index * slotSize;
		const duration = Math.max(1, Math.min(tasks[index].durationMinutes, slotSize - 2));
		addSession(
			tasks[index],
			today,
			startMinute,
			duration,
			`${tasks[index].sessionLabel} · 今日示例 / Today's example`
		);
	}

	return tasks;
}

/** Build six bilingual example tasks with year-to-date daily time coverage. */
export function buildExampleTaskNotes(options: {
	status: string;
	completedStatus: string;
	statusField: string;
	priorityField: string;
	scheduledField: string;
	timeEntriesField: string;
	date?: Date;
}): ExampleNote[] {
	const now = options.date ?? new Date();
	const day = formatLocalDate(now);
	const samples = buildExampleTasks(now);
	const notes = samples.map((sample, index): ExampleNote => {
		const isCompletedExample = index === samples.length - 1;
		const frontmatter = {
			taskType: "task",
			taskquenceExample: true,
			[options.statusField]: isCompletedExample ? options.completedStatus : options.status,
			[options.priorityField]: index === 0 ? "high" : "normal",
			[options.scheduledField]: day,
			tags: [sample.tag],
			[options.timeEntriesField]: sample.entries,
		};
		return {
			path: `TASKquence/Tasks/${sample.name}.md`,
			content: `---\n${stringify(frontmatter)}---\n\n# ${sample.name}\n\n> 示例任务 / Example task — 数据覆盖今年截至今天，可自由修改或删除。\n> Time data covers this year through today. You can edit or delete it freely.\n\n${sample.body}\n\n[[TASKquence/Tasks/功能说明与示例指南|功能与示例说明 / Feature and example guide]]\n`,
		};
	});
	notes.push({
		path: "TASKquence/Tasks/功能说明与示例指南.md",
		content: `# TASKquence 功能说明与示例指南 / Feature and example guide

这六个双语示例分别使用工作、学习、创作、健身、家务和娱乐标签。计时数据从今年 1 月 1 日覆盖到今天：每天都有记录，每周覆盖全部六类活动，每个月也都有数据。今天的多段记录用于展示时间线；工作投入略高，用于形成更清晰的标签占比和任务排行。

## 按顺序试一遍

1. 打开时间统计，在日、周、月和年范围之间切换。
2. 查看今天的时间线、当月热力图、标签分布和任务排行。
3. 打开任意示例，编辑或删除时间记录，观察统计页面刷新。
4. 打开看板，修改任务标题、日期和优先级，或拖动任务状态。
5. 点击状态标题旁的 ⋯，编辑或删除状态；保存后当前看板会自动刷新。

这些是演示数据，不代表你的真实投入。示例只会在没有任何真实任务数据的新仓库中自动创建一次；已有任务的用户不会收到示例。删除示例后不会自动重建，也可以在设置中手动恢复缺失示例。本文没有任务识别属性，不会成为任务卡片。

## English

These six bilingual examples use separate work, study, creation, fitness, home and leisure tags. Their completed sessions cover every day from January 1 through today, all six categories across each full week, and every elapsed month. Today's varied sessions demonstrate the timeline, while a larger work share makes the distribution and rankings easier to read.

Switch between day, week, month and year statistics, edit or delete a sample session, and try changing a status from the Kanban header menu. Example data is created automatically only in a new vault with no real task data. Deleted examples stay deleted unless you explicitly restore missing examples from settings. This guide is not a task.

## 更多说明 / More help

- [[TASKquence/看板使用说明|看板使用说明]] / [[TASKquence/Kanban Guide|Kanban guide]]
- [[TASKquence/Tasks/App/TASKquence iOS 中文指南|iOS 配套使用]] / [[TASKquence/Tasks/App/TASKquence iOS|iOS companion]]
`,
	});
	return notes;
}
