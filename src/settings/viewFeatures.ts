import type { TaskNotesSettings } from "../types/settings";

export const DEFAULT_ENABLED_VIEWS: Record<string, boolean> = {
	"open-kanban-view": true,
	"open-statistics": true,
	"open-calendar-view": false,
	"open-advanced-calendar-view": false,
	"open-tasks-view": false,
	"open-agenda-view": false,
	"open-pomodoro-view": false,
	"open-pomodoro-stats": false,
	"pomodoro-stats-base": false,
	relationships: false,
};

export function isViewEnabled(
	settings: Pick<TaskNotesSettings, "enabledViews">,
	commandId: string
): boolean {
	return settings.enabledViews?.[commandId] ?? DEFAULT_ENABLED_VIEWS[commandId] ?? true;
}
