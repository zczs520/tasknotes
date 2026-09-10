import fs from "fs";
import path from "path";

function readRepoFile(relativePath: string): string {
	return fs.readFileSync(path.resolve(__dirname, "../../..", relativePath), "utf8");
}

describe("TaskNotes Kanban Notion-style layout", () => {
	it("loads its scoped skin after the shared Bases styles", () => {
		const buildManifest = readRepoFile("build-css.mjs");
		const sharedStyles = buildManifest.indexOf("styles/bases-views.css");
		const kanbanSkin = buildManifest.indexOf("styles/kanban-notion.css");

		expect(sharedStyles).toBeGreaterThan(-1);
		expect(kanbanSkin).toBeGreaterThan(sharedStyles);

		const css = readRepoFile("styles/kanban-notion.css");
		expect(css).toContain(".tasknotes-plugin.tn-tasknotesKanban");
		expect(css).toContain(".kanban-view__swimlane-section--collapsed");
		expect(css).toContain(".kanban-view__card-wrapper > .task-card");
		expect(css).toContain(".kanban-view__add-task-label");
		expect(css).toContain(".kanban-view__swimlane-drag-handle");
		expect(css).toContain(".task-card__metadata-property--file\\.name");
		expect(css).toContain(".task-card__details-indicator");
		expect(css).toContain(".task-card__metadata-property--file\\.tags");
		expect(css).not.toContain(".bases-toolbar");
	});

	it("renders collapsible swimlane sections and readable creation actions", () => {
		const source = readRepoFile("src/bases/KanbanView.ts");

		expect(source).toContain('cls: "kanban-view__swimlane-section"');
		expect(source).toContain("this.collapsedSwimLanes.add(swimLaneKey)");
		expect(source).toContain("this.setupSwimLaneSectionDragHandlers");
		expect(source).toContain('this.config.set("swimLaneOrder"');
		expect(source).toContain("showSecondaryBadges: false");
		expect(source).toContain("openEditOnAnyClick: true");
		expect(source).toContain("interactiveTags: false");
		expect(source).toContain("filterKanbanTasksByTime");
		expect(source).toContain('private timeFilterField: KanbanTimeFilterField = "scheduled"');
		expect(source).toContain("showTimeFilterFieldMenu");
		expect(source).toContain("const app = this.app || this.plugin.app");
		expect(source).toContain("open-kanban-custom-time-filter");
		expect(source).toContain('translate("views.kanban.tagsLabel")');
		expect(source).toContain('cls: "kanban-view__add-task-label"');
		expect(source).toContain('translate("views.kanban.newTask")');
		expect(source).toContain("An empty date period still");
		expect(source).not.toContain("this.renderEmptyState();");
	});
});
