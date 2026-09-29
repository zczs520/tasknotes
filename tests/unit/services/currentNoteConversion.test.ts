import {
	buildCurrentNoteConversionTaskInfo,
	extractMarkdownBodyAfterFrontmatter,
	parseCurrentNoteFrontmatter,
	persistCurrentNoteConversion,
	removeMarkdownSourceRanges,
	readCurrentNoteForConversion,
} from "../../../src/services/task-service/currentNoteConversion";

const settings = {
	defaultTaskStatus: "none",
	defaultTaskPriority: "high",
};

describe("current note conversion planning", () => {
	it("parses frontmatter from the same saved content used for conversion", () => {
		expect(parseCurrentNoteFrontmatter("---\nstatus: open\npriority: high\n---\nLatest body")).toEqual({
			status: "open",
			priority: "high",
		});
	});

	it("persists conversion immediately instead of waiting for a modal edit", async () => {
		const task = buildCurrentNoteConversionTaskInfo({
			path: "Notes/plain.md",
			basename: "plain",
			content: "123456789",
			settings,
			now: "2026-09-29T10:00:00+08:00",
			today: "2026-09-29",
		});
		const updateTask = jest.fn(async (original, updates) => ({ ...original, ...updates }));

		await persistCurrentNoteConversion(task, { updateTask });

		expect(updateTask).toHaveBeenCalledWith(task, {
			status: "none",
			priority: "high",
			scheduled: "2026-09-29",
			dateCreated: "2026-09-29T10:00:00+08:00",
			dateModified: "2026-09-29T10:00:00+08:00",
		});
	});

	it("extracts a CRLF note body without retaining frontmatter", () => {
		expect(extractMarkdownBodyAfterFrontmatter("---\r\nstatus: open\r\n---\r\n123456789")).toBe(
			"123456789"
		);
	});
	it("saves the active editor before reading the note being converted", async () => {
		let content = "123456";
		const file = { path: "Notes/plain.md" };
		const save = jest.fn(async () => {
			content = "123456789";
		});
		const app = {
			workspace: { getActiveViewOfType: () => ({ file, save }) },
			vault: { read: jest.fn(async () => content) },
		};
		expect(await readCurrentNoteForConversion(app as any, file as any)).toBe(
			"123456789"
		);
		expect(save).toHaveBeenCalledTimes(1);
	});

	it("builds task info from frontmatter, defaults, and markdown body", () => {
		const task = buildCurrentNoteConversionTaskInfo({
			path: "Notes/plain.md",
			basename: "plain",
			content: "---\ntitle: Frontmatter title\n---\n\nExisting note body\n",
			frontmatter: {
				title: "Frontmatter title",
				status: undefined,
				priority: "medium",
				due: "2026-05-20",
				scheduled: 20260519,
				contexts: ["work", 42],
				projects: "[[Project]]",
				tags: ["task", true],
				timeEstimate: "45",
				recurrence: "FREQ=DAILY",
				dateCreated: "2026-05-18T10:00:00+10:00",
			},
			settings,
			now: "2026-05-19T09:20:00+10:00",
			today: "2026-05-19",
		});

		expect(task).toMatchObject({
			path: "Notes/plain.md",
			title: "Frontmatter title",
			status: "none",
			priority: "medium",
			archived: false,
			due: "2026-05-20",
			scheduled: "20260519",
			contexts: ["work", "42"],
			projects: ["[[Project]]"],
			tags: ["task", "true"],
			timeEstimate: 45,
			recurrence: "FREQ=DAILY",
			dateCreated: "2026-05-18T10:00:00+10:00",
			dateModified: "2026-05-19T09:20:00+10:00",
			details: "Existing note body",
		});
	});

	it("falls back to basename and default priority/status without losing empty strings", () => {
		const task = buildCurrentNoteConversionTaskInfo({
			path: "Notes/empty-status.md",
			basename: "empty-status",
			content: "Body",
			frontmatter: {
				title: "",
				status: "",
				priority: "",
				dateCreated: "",
				timeEstimate: "not a number",
			},
			settings,
			now: "2026-05-19T09:20:00+10:00",
			today: "2026-05-19",
		});

		expect(task.title).toBe("empty-status");
		expect(task.status).toBe("");
		expect(task.priority).toBe("");
		expect(task.dateCreated).toBe("2026-05-19T09:20:00+10:00");
		expect(task.timeEstimate).toBeUndefined();
		expect(task.scheduled).toBe("2026-05-19");
	});

	it("inherits every document tag and defaults the scheduled date to today", () => {
		const content = "#学习/微观经济学 #考试\n\n正文";
		const firstTagStart = content.indexOf("#学习/微观经济学");
		const secondTagStart = content.indexOf("#考试");
		const task = buildCurrentNoteConversionTaskInfo({
			path: "学习/微观经济学/案例-涨价与收入.md",
			basename: "案例-涨价与收入",
			content,
			frontmatter: {
				tags: ["复习"],
			},
			documentTags: ["复习", "学习/微观经济学", "考试"],
			inlineTagRanges: [
				{ start: firstTagStart, end: firstTagStart + "#学习/微观经济学".length },
				{ start: secondTagStart, end: secondTagStart + "#考试".length },
			],
			settings,
			now: "2026-09-08T12:00:00+08:00",
			today: "2026-09-08",
		});

		expect(task.scheduled).toBe("2026-09-08");
		expect(task.tags).toEqual(["复习", "学习/微观经济学", "考试"]);
		expect(task.details).toBe("正文");
	});

	it("preserves an existing scheduled date when converting", () => {
		const task = buildCurrentNoteConversionTaskInfo({
			path: "Notes/planned.md",
			basename: "planned",
			content: "Body",
			frontmatter: { scheduled: "2026-09-12" },
			settings,
			today: "2026-09-08",
		});

		expect(task.scheduled).toBe("2026-09-12");
	});

	it("extracts the body after frontmatter and preserves notes without frontmatter", () => {
		expect(
			extractMarkdownBodyAfterFrontmatter("---\ntitle: Note\n---\n\nBody\n")
		).toBe("Body");
		expect(extractMarkdownBodyAfterFrontmatter("\nPlain note\n")).toBe("Plain note");
	});

	it("ignores invalid source ranges while removing valid inline tags", () => {
		expect(
			removeMarkdownSourceRanges("Before #tag after", [
				{ start: 7, end: 11 },
				{ start: -1, end: 4 },
				{ start: 99, end: 100 },
			])
		).toBe("Before  after");
	});
});
