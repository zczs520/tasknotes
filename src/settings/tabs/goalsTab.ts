import type TaskNotesPlugin from "../../main";
import { DEFAULT_GOALS_FOLDER, normalizeGoalsFolder } from "../../goals/goalFolder";
import { configureTextSetting, createSettingGroup } from "../components/settingHelpers";

export function renderGoalsTab(
	container: HTMLElement,
	plugin: TaskNotesPlugin,
	save: () => void
): void {
	container.empty();
	const translate = (key: string) => plugin.i18n.translate(key);
	createSettingGroup(
		container,
		{ heading: translate("settings.goals.heading") },
		(group) => {
			group.addSetting((setting) => {
				configureTextSetting(setting, {
					name: translate("settings.goals.folder.name"),
					desc: plugin.i18n.translate("settings.goals.folder.description", {
						defaultFolder: DEFAULT_GOALS_FOLDER,
						legacyFolder: "Goals",
					}),
					placeholder: DEFAULT_GOALS_FOLDER,
					getValue: () => normalizeGoalsFolder(plugin.settings.goalsFolder),
					setValue: (value: string) => {
						plugin.settings.goalsFolder = normalizeGoalsFolder(value);
						save();
					},
					ariaLabel: translate("settings.goals.folder.name"),
				});
			});
		}
	);
}
