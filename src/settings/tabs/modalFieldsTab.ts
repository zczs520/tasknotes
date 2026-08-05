import { Notice } from "obsidian";
import TaskNotesPlugin from "../../main";
import { createSettingGroup, configureToggleSetting } from "../components/settingHelpers";
import { createFieldManager, addFieldManagerStyles } from "../components/FieldManagerComponent";
import { initializeFieldConfig } from "../../utils/fieldConfigDefaults";
import type { TaskModalFieldsConfig, UserMappedField } from "../../types/settings";
import { showConfirmationModal } from "../../modals/ConfirmationModal";
import type { TranslationKey } from "../../i18n";

/**
 * Renders the Modal Fields Configuration tab
 */
export function renderModalFieldsTab(
	container: HTMLElement,
	plugin: TaskNotesPlugin,
	save: () => void
): void {
	container.empty();
	const translate = (key: TranslationKey, params?: Record<string, string | number>) =>
		plugin.i18n.translate(key, params);

	// Add styles for field manager
	addFieldManagerStyles();

	// Ensure modal fields config exists
	if (!plugin.settings.modalFieldsConfig) {
		plugin.settings.modalFieldsConfig = initializeFieldConfig(
			undefined,
			plugin.settings.userFields
		);
		save(); // Save the initialized config
	}

	// Configuration Section
	createSettingGroup(
		container,
		{
			heading: translate("settings.modalFields.heading"),
			description: translate("settings.modalFields.description"),
		},
		(group) => {
			group.addSetting((setting) => {
				configureToggleSetting(setting, {
					name: translate("settings.modalFields.tabMovesFocus.name"),
					desc: translate("settings.modalFields.tabMovesFocus.description"),
					getValue: () => plugin.settings.taskModalTabMovesFocus,
					setValue: (value) => {
						plugin.settings.taskModalTabMovesFocus = value;
						save();
					},
				});
			});

			// Sync button
			group.addSetting((setting) => {
				setting
					.setName(translate("settings.modalFields.sync.name"))
					.setDesc(translate("settings.modalFields.sync.description"))
					.addButton((button) => {
						button
							.setButtonText(translate("settings.modalFields.sync.button"))
							.setCta()
							.onClick(() => {
								syncUserFieldsToConfig(plugin);
								save();
								new Notice(translate("settings.modalFields.sync.success"));
								// Re-render the tab
								renderModalFieldsTab(container, plugin, save);
							});
					});
			});

			// Reset button
			group.addSetting((setting) => {
				setting
					.setName(translate("settings.modalFields.reset.name"))
					.setDesc(translate("settings.modalFields.reset.description"))
					.addButton((button) => {
						button
							.setButtonText(translate("settings.modalFields.reset.button"))
							.setWarning()
							.onClick(async () => {
								const confirmed = await showConfirmationModal(plugin.app, {
									title: translate("settings.modalFields.reset.confirmTitle"),
									message: translate("settings.modalFields.reset.confirmMessage"),
									confirmText: translate("settings.modalFields.reset.confirm"),
									cancelText: translate("common.cancel"),
									isDestructive: true,
								});

								if (confirmed) {
									plugin.settings.modalFieldsConfig = initializeFieldConfig(
										undefined,
										plugin.settings.userFields
									);
									save();
									new Notice(translate("settings.modalFields.reset.success"));
									// Re-render the tab
									renderModalFieldsTab(container, plugin, save);
								}
							});
					});
			});
		}
	);

	// Field manager (keep existing component for now - has its own internal tabs)
	const managerContainer = container.createDiv({ cls: "modal-fields-manager-container" });

	// Double-check config exists before creating field manager
	if (!plugin.settings.modalFieldsConfig) {
		managerContainer.createDiv({
			text: translate("settings.modalFields.errors.initialize"),
		});
		return;
	}

	createFieldManager(
		managerContainer,
		plugin,
		plugin.settings.modalFieldsConfig,
		(updatedConfig: TaskModalFieldsConfig) => {
			plugin.settings.modalFieldsConfig = updatedConfig;
			save();
		},
		plugin.app
	);
}

/**
 * Syncs user fields from the old system into the modal field configuration
 */
function syncUserFieldsToConfig(plugin: TaskNotesPlugin): void {
	if (!plugin.settings.modalFieldsConfig) {
		plugin.settings.modalFieldsConfig = initializeFieldConfig(
			undefined,
			plugin.settings.userFields
		);
		return;
	}

	if (!plugin.settings.userFields || plugin.settings.userFields.length === 0) {
		return;
	}

	const config = plugin.settings.modalFieldsConfig;

	// Get existing user field IDs in config
	const existingUserFieldIds = new Set(
		config.fields.filter((f) => f.fieldType === "user").map((f) => f.id)
	);

	// Add new user fields from settings
	plugin.settings.userFields.forEach((userField: UserMappedField) => {
		if (!existingUserFieldIds.has(userField.id)) {
			// Find the highest order in custom group
			const customGroupFields = config.fields.filter((f) => f.group === "custom");
			const maxOrder =
				customGroupFields.length > 0
					? Math.max(...customGroupFields.map((f) => f.order))
					: -1;

			config.fields.push({
				id: userField.id,
				fieldType: "user",
				group: "custom",
				displayName: userField.displayName,
				visibleInCreation: true,
				visibleInEdit: true,
				order: maxOrder + 1,
				enabled: true,
			});
		} else {
			// Update display name if changed
			const fieldIndex = config.fields.findIndex((f) => f.id === userField.id);
			if (fieldIndex !== -1) {
				config.fields[fieldIndex].displayName = userField.displayName;
			}
		}
	});

	// Remove user fields that no longer exist in userFields
	const currentUserFieldIds = new Set(
		plugin.settings.userFields.map((f: UserMappedField) => f.id)
	);
	config.fields = config.fields.filter(
		(f) => f.fieldType !== "user" || currentUserFieldIds.has(f.id)
	);
}
