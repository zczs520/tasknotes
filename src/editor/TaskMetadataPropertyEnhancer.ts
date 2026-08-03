import type TaskNotesPlugin from "../main";
import type { TaskInfo } from "../types";
import { formatTimestampForDisplay } from "../utils/dateUtils";
import { calculateTotalTimeSpent, formatTime, getActiveTimeEntry } from "../utils/helpers";

const SUMMARY_CLASS = "tasknotes-system-property__summary";
const ENHANCED_VALUE_CLASS = "tasknotes-system-property__value";
const ENHANCED_ROW_CLASS = "tasknotes-system-property";

type SystemPropertyId = "dateCreated" | "dateModified" | "timeEntries";

export interface TaskMetadataPropertySummary {
	text: string;
	title: string;
	interactive: boolean;
}

function translate(
	plugin: TaskNotesPlugin,
	key: string,
	vars?: Record<string, string | number>
): string {
	return plugin.i18n.translate(`ui.taskCard.${key}`, vars);
}

function getMappedPropertyKey(plugin: TaskNotesPlugin, propertyId: SystemPropertyId): string {
	return plugin.fieldMapper.toUserField(propertyId);
}

function matchesPropertyKey(
	plugin: TaskNotesPlugin,
	propertyId: SystemPropertyId,
	propertyKey: string
): boolean {
	return (
		getMappedPropertyKey(plugin, propertyId).toLocaleLowerCase() ===
		propertyKey.toLocaleLowerCase()
	);
}

export function getTaskMetadataPropertySummary(
	propertyKey: string,
	task: TaskInfo,
	plugin: TaskNotesPlugin
): TaskMetadataPropertySummary | null {
	if (matchesPropertyKey(plugin, "dateCreated", propertyKey) && task.dateCreated) {
		return {
			text: formatTimestampForDisplay(task.dateCreated, "yyyy-MM-dd HH:mm"),
			title: task.dateCreated,
			interactive: false,
		};
	}

	if (matchesPropertyKey(plugin, "dateModified", propertyKey) && task.dateModified) {
		return {
			text: formatTimestampForDisplay(task.dateModified, "yyyy-MM-dd HH:mm"),
			title: task.dateModified,
			interactive: false,
		};
	}

	if (!matchesPropertyKey(plugin, "timeEntries", propertyKey)) {
		return null;
	}

	const entries = task.timeEntries ?? [];
	const duration = formatTime(calculateTotalTimeSpent(entries));
	const active = getActiveTimeEntry(entries) !== null;
	const summaryKey = active ? "timeEntriesActiveSummary" : "timeEntriesSummary";
	return {
		text: translate(plugin, summaryKey, { count: entries.length, duration }),
		title: translate(plugin, "editTimeEntriesTooltip"),
		interactive: true,
	};
}

function prepareTimeEntriesSummary(
	summaryElement: HTMLElement,
	task: TaskInfo,
	plugin: TaskNotesPlugin
): void {
	summaryElement.setAttribute("role", "button");
	summaryElement.tabIndex = 0;
	summaryElement.onclick = (event) => {
		event.preventDefault();
		event.stopPropagation();
		const latestTask = plugin.cacheManager.getCachedTaskInfoSync(task.path) ?? task;
		plugin.openTimeEntryEditor(latestTask);
	};
	summaryElement.onkeydown = (event) => {
		if (event.key !== "Enter" && event.key !== " ") {
			return;
		}
		event.preventDefault();
		event.stopPropagation();
		summaryElement.click();
	};
}

export function enhanceTaskMetadataProperties(
	root: ParentNode,
	task: TaskInfo,
	plugin: TaskNotesPlugin
): void {
	for (const row of root.querySelectorAll<HTMLElement>(".metadata-property[data-property-key]")) {
		const propertyKey = row.dataset.propertyKey;
		if (!propertyKey) {
			continue;
		}

		const summary = getTaskMetadataPropertySummary(propertyKey, task, plugin);
		if (!summary) {
			continue;
		}

		const valueContainer = row.querySelector<HTMLElement>(".metadata-property-value");
		if (!valueContainer) {
			continue;
		}

		row.classList.add(ENHANCED_ROW_CLASS);
		valueContainer.classList.add(ENHANCED_VALUE_CLASS);
		let summaryElement = valueContainer.querySelector<HTMLElement>(`.${SUMMARY_CLASS}`);
		if (!summaryElement) {
			summaryElement = valueContainer.createEl("span", { cls: SUMMARY_CLASS });
		}

		if (summaryElement.textContent !== summary.text) {
			summaryElement.textContent = summary.text;
		}
		summaryElement.title = summary.title;
		summaryElement.setAttribute("aria-label", summary.title);

		if (summary.interactive) {
			prepareTimeEntriesSummary(summaryElement, task, plugin);
		} else {
			summaryElement.removeAttribute("role");
			summaryElement.removeAttribute("tabindex");
			summaryElement.onclick = null;
			summaryElement.onkeydown = null;
		}
	}
}

export function removeTaskMetadataPropertyEnhancements(root: ParentNode): void {
	for (const summary of root.querySelectorAll(`.${SUMMARY_CLASS}`)) {
		summary.remove();
	}
	for (const value of root.querySelectorAll(`.${ENHANCED_VALUE_CLASS}`)) {
		value.classList.remove(ENHANCED_VALUE_CLASS);
	}
	for (const row of root.querySelectorAll(`.${ENHANCED_ROW_CLASS}`)) {
		row.classList.remove(ENHANCED_ROW_CLASS);
	}
}
