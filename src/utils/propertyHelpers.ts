import type TaskNotesPlugin from "../main";
import type { FieldMapping } from "../types";

/**
 * Get all available properties for property selection modals.
 * Returns internal property IDs (FieldMapping keys) with localized labels showing
 * both the display name and user-configured property name.
 *
 * Includes both core properties and user-defined fields.
 */
export function getAvailableProperties(
	plugin: TaskNotesPlugin
): Array<{ id: string; label: string }> {
	const getLabel = (id: string): string =>
		plugin.i18n.translate(`settings.propertySelector.properties.${id}`);
	const makeLabel = (
		id: string,
		defaultDisplayName: string,
		mappingKey: keyof FieldMapping
	): string => {
		const displayName = getLabel(id);
		const userPropertyName = plugin.fieldMapper.toUserField(mappingKey);
		if (userPropertyName !== defaultDisplayName.toLowerCase().replace(/\s+/g, "")) {
			return `${displayName} (${userPropertyName})`;
		}
		return displayName;
	};

	const coreProperties = [
		{ id: "status", label: makeLabel("status", "Status", "status") },
		{ id: "priority", label: makeLabel("priority", "Priority", "priority") },
		{ id: "blocked", label: getLabel("blocked") },
		{ id: "blocking", label: getLabel("blocking") },
		{ id: "due", label: makeLabel("due", "Due Date", "due") },
		{ id: "scheduled", label: makeLabel("scheduled", "Scheduled Date", "scheduled") },
		{
			id: "timeEstimate",
			label: makeLabel("timeEstimate", "Time Estimate", "timeEstimate"),
		},
		{ id: "totalTrackedTime", label: getLabel("totalTrackedTime") },
		{ id: "checklistProgress", label: getLabel("checklistProgress") },
		{ id: "recurrence", label: makeLabel("recurrence", "Recurrence", "recurrence") },
		{
			id: "completeInstances",
			label: makeLabel(
				"completeInstances",
				"Completed Instances",
				"completeInstances"
			),
		},
		{
			id: "skippedInstances",
			label: makeLabel(
				"skippedInstances",
				"Skipped Instances",
				"skippedInstances"
			),
		},
		{
			id: "completedDate",
			label: makeLabel("completedDate", "Completed Date", "completedDate"),
		},
		{
			id: "dateCreated",
			label: makeLabel("dateCreated", "Created Date", "dateCreated"),
		},
		{
			id: "dateModified",
			label: makeLabel("dateModified", "Modified Date", "dateModified"),
		},
		{ id: "projects", label: makeLabel("projects", "Projects", "projects") },
		{ id: "contexts", label: makeLabel("contexts", "Contexts", "contexts") },
		{ id: "tags", label: getLabel("tags") },
	];

	const userProperties =
		plugin.settings.userFields?.map((field) => ({
			id: `user:${field.id}`,
			label: field.displayName,
		})) || [];

	return [...coreProperties, ...userProperties];
}

/**
 * Get labels for a list of property IDs
 * Useful for displaying current selection
 */
export function getPropertyLabels(
	plugin: TaskNotesPlugin,
	propertyIds: string[]
): string[] {
	const availableProperties = getAvailableProperties(plugin);
	return propertyIds
		.map((id) => availableProperties.find((property) => property.id === id)?.label || id)
		.filter(Boolean);
}