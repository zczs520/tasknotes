import type TaskNotesPlugin from "../main";
import { requireApiVersion } from "obsidian";
import { buildTaskListViewFactory } from "./TaskListView";
import { buildKanbanViewFactory } from "./KanbanView";
import { buildCalendarViewFactory } from "./CalendarView";
import { buildMiniCalendarViewFactory } from "./MiniCalendarView";
import { buildTimeStatisticsViewFactory } from "./TimeStatisticsView";
import { registerBasesView, unregisterBasesView } from "./api";
import { buildCalendarViewOptions, buildMiniCalendarViewOptions } from "./calendarViewOptions";
import { createTaskNotesLogger } from "../utils/tasknotesLogger";
import { buildSwimLaneVisibilityToggleOptions } from "./kanbanSwimLaneVisibility";

type TranslateBasesSetting = (key: string) => string;

function translateBasesSetting(plugin: TaskNotesPlugin): TranslateBasesSetting {
	return (key: string) => plugin.i18n.translate(`views.basesViewSettings.${key}`);
}

function buildKanbanCardLayoutOptions(t: TranslateBasesSetting): Record<string, string> {
	return {
		default: t("options.default"),
		compact: t("options.compact"),
	};
}

function buildTaskListDefaultCollapsedStateOptions(
	t: TranslateBasesSetting
): Record<string, string> {
	return {
		Expanded: t("options.expanded"),
		Collapsed: t("options.collapsed"),
	};
}

function buildExpandedRelationshipFilterModeOptions(
	t: TranslateBasesSetting
): Record<string, string> {
	return {
		inherit: t("options.inherit"),
		"show-all": t("options.showAll"),
	};
}

/**
 * Register TaskNotes views with Bases plugin
 * Requires Obsidian 1.10.1+ (public Bases API with groupBy support)
 */
export async function registerBasesTaskList(plugin: TaskNotesPlugin): Promise<void> {
	if (!plugin.settings.enableBases) return;
	// All views now require Obsidian 1.10.1+ (public Bases API with groupBy support)
	if (!requireApiVersion("1.10.1")) return;
	const logger = createTaskNotesLogger({
		tag: "Bases/Registration",
		isDebugEnabled: () => plugin.settings.enableDebugLogging,
	});

	const attemptRegistration = async (): Promise<boolean> => {
		try {
			const t = translateBasesSetting(plugin);
			// Register Task List view using public API
			const taskListSuccess = registerBasesView(
				plugin,
				"tasknotesTaskList",
				{
					name: t("viewNames.taskList"),
					icon: "tasknotes-simple",
					factory: buildTaskListViewFactory(plugin),
					options: () => [
						{
							type: "property",
							key: "subGroup",
							displayName: t("taskList.subGroupBy"),
							placeholder: t("taskList.subGroupByPlaceholder"),
							filter: (prop: string) => {
								// Show all note, task, and formula properties that could be used for sub-grouping
								return (
									prop.startsWith("note.") ||
									prop.startsWith("task.") ||
									prop.startsWith("formula.")
								);
							},
						},
						{
							type: "toggle",
							key: "enableSearch",
							displayName: t("common.enableSearch"),
							default: false,
						},
						{
							type: "dropdown",
							key: "defaultCollapsedState",
							displayName: t("taskList.defaultCollapsedState"),
							default: "Expanded",
							options: buildTaskListDefaultCollapsedStateOptions(t),
						},
						{
							type: "dropdown",
							key: "expandedRelationshipFilterMode",
							displayName: t("common.expandedRelationships"),
							default: "inherit",
							options: buildExpandedRelationshipFilterModeOptions(t),
						},
						{
							type: "toggle",
							key: "hideTopLevelSubtasks",
							displayName: t("common.hideTopLevelSubtasks"),
							default: false,
						},
					],
				},
				logger
			);

			// Register Kanban view using public API
			const kanbanSuccess = registerBasesView(
				plugin,
				"tasknotesKanban",
				{
					name: t("viewNames.kanban"),
					icon: "tasknotes-simple",
					factory: buildKanbanViewFactory(plugin),
					options: (config) => [
						{
							type: "property",
							key: "swimLane",
							displayName: t("kanban.swimLane"),
							placeholder: t("kanban.swimLanePlaceholder"),
							filter: (prop: string) => {
								// Show all note, task, and formula properties that could be used for swimlanes
								return (
									prop.startsWith("note.") ||
									prop.startsWith("task.") ||
									prop.startsWith("formula.")
								);
							},
						},
						{
							type: "group",
							displayName: t("kanban.visibleSwimLanes"),
							items: buildSwimLaneVisibilityToggleOptions(config),
							shouldHide: () =>
								buildSwimLaneVisibilityToggleOptions(config).length === 0,
						},
						{
							type: "toggle",
							key: "boardFullWidth",
							displayName: t("kanban.boardFullWidth"),
							default: false,
						},
						{
							type: "slider",
							key: "boardWidth",
							displayName: t("kanban.boardWidth"),
							default: 1200,
							min: 600,
							max: 2400,
							step: 50,
							shouldHide: () => config.get("boardFullWidth") === true,
						},
						{
							type: "slider",
							key: "boardSideMargin",
							displayName: t("kanban.boardSideMargin"),
							default: 0,
							min: 0,
							max: 200,
							step: 8,
						},
						{
							type: "slider",
							key: "columnWidth",
							displayName: t("kanban.columnWidth"),
							default: 280,
							min: 200,
							max: 500,
							step: 20,
						},
						{
							type: "slider",
							key: "maxSwimlaneHeight",
							displayName: t("kanban.maxSwimlaneHeight"),
							default: 600,
							min: 300,
							max: 1200,
							step: 50,
						},
						{
							type: "toggle",
							key: "hideEmptyColumns",
							displayName: t("kanban.hideEmptyColumns"),
							default: false,
						},
						{
							type: "text",
							key: "pinnedColumns",
							displayName: t("kanban.pinnedColumns"),
							placeholder: t("kanban.pinnedColumnsPlaceholder"),
							default: "",
						},
						{
							type: "toggle",
							key: "hideEmptySwimLanes",
							displayName: t("kanban.hideEmptySwimlanes"),
							default: false,
						},
						{
							type: "toggle",
							key: "enableSearch",
							displayName: t("kanban.enableSearchAndTimeFilter"),
							default: false,
						},
						{
							type: "toggle",
							key: "explodeListColumns",
							displayName: t("kanban.showItemsInMultipleColumns"),
							default: true,
						},
						{
							type: "toggle",
							key: "consolidateStatusIcon",
							displayName: t("kanban.showStatusIconInHeaderOnly"),
							default: false,
						},
						{
							type: "dropdown",
							key: "cardLayout",
							displayName: t("kanban.cardLayout"),
							default: "default",
							options: buildKanbanCardLayoutOptions(t),
						},
						{
							type: "text",
							key: "columnOrder",
							displayName: t("kanban.columnOrderAdvanced"),
							placeholder: t("kanban.columnOrderPlaceholder"),
							default: "{}",
						},
						{
							type: "text",
							key: "swimLaneOrder",
							displayName: t("kanban.swimLaneOrderAdvanced"),
							placeholder: t("kanban.swimLaneOrderPlaceholder"),
							default: "{}",
						},
						{
							type: "dropdown",
							key: "expandedRelationshipFilterMode",
							displayName: t("common.expandedRelationships"),
							default: "inherit",
							options: buildExpandedRelationshipFilterModeOptions(t),
						},
						{
							type: "toggle",
							key: "hideTopLevelSubtasks",
							displayName: t("common.hideTopLevelSubtasks"),
							default: false,
						},
					],
				},
				logger
			);

			// Register Calendar view using public API
			const calendarSuccess = registerBasesView(
				plugin,
				"tasknotesCalendar",
				{
					name: t("viewNames.calendar"),
					icon: "tasknotes-simple",
					factory: buildCalendarViewFactory(plugin),
					options: (config) => buildCalendarViewOptions(plugin, config),
				},
				logger
			);

			// Register Mini Calendar view using public API
			const miniCalendarSuccess = registerBasesView(
				plugin,
				"tasknotesMiniCalendar",
				{
					name: t("viewNames.miniCalendar"),
					icon: "tasknotes-simple",
					factory: buildMiniCalendarViewFactory(plugin),
					options: () => buildMiniCalendarViewOptions(plugin),
				},
				logger
			);

			const timeStatisticsSuccess = registerBasesView(
				plugin,
				"tasknotesTimeStatistics",
				{
					name: t("viewNames.timeStatistics"),
					icon: "bar-chart-3",
					factory: buildTimeStatisticsViewFactory(plugin),
				},
				logger
			);

			// Consider it successful if any view registered successfully
			if (
				!taskListSuccess &&
				!kanbanSuccess &&
				!calendarSuccess &&
				!miniCalendarSuccess &&
				!timeStatisticsSuccess
			) {
				logger.debug("Bases plugin not available for registration", {
					category: "configuration",
					operation: "register-views",
				});
				return false;
			}

			// Refresh existing Bases views
			plugin.app.workspace.iterateAllLeaves((leaf) => {
				if (leaf.view?.getViewType?.() === "bases") {
					const view = leaf.view as { refresh?: () => void };
					if (typeof view.refresh === "function") {
						try {
							view.refresh();
						} catch (refreshError) {
							logger.debug("Error refreshing Bases view after registration", {
								category: "provider",
								operation: "refresh-existing-view",
								error: refreshError,
							});
						}
					}
				}
			});

			return true;
		} catch (error) {
			logger.warn("Registration attempt failed", {
				category: "provider",
				operation: "register-views",
				error,
			});
			return false;
		}
	};

	// Try immediate registration
	if (await attemptRegistration()) {
		return;
	}

	// If that fails, try a few more times with short delays
	for (let i = 0; i < 5; i++) {
		await new Promise((r) => window.setTimeout(r, 200));
		if (await attemptRegistration()) {
			return;
		}
	}

	logger.warn("Failed to register views after multiple attempts", {
		category: "configuration",
		operation: "register-views",
	});
}

/**
 * Unregister TaskNotes views from Bases plugin
 */
export function unregisterBasesViews(plugin: TaskNotesPlugin): void {
	const logger = createTaskNotesLogger({
		tag: "Bases/Registration",
		isDebugEnabled: () => plugin.settings.enableDebugLogging,
	});
	try {
		// Unregister views using wrapper (uses internal API as public API doesn't provide unregister)
		unregisterBasesView(plugin, "tasknotesTaskList", logger);
		unregisterBasesView(plugin, "tasknotesKanban", logger);
		unregisterBasesView(plugin, "tasknotesCalendar", logger);
		unregisterBasesView(plugin, "tasknotesMiniCalendar", logger);
		unregisterBasesView(plugin, "tasknotesTimeStatistics", logger);
	} catch (error) {
		logger.error("Error during view unregistration", {
			category: "provider",
			operation: "unregister-views",
			error,
		});
	}
}
