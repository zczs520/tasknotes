import { ensureExampleTasks } from "../../bootstrap/exampleTasks";
import { Notice, TFile } from "obsidian";
import TaskNotesPlugin from "../../main";
import {
	createSettingGroup,
	configureTextSetting,
	configureToggleSetting,
	configureDropdownSetting,
} from "../components/settingHelpers";
import { TranslationKey } from "../../i18n";
import { showConfirmationModal } from "../../modals/ConfirmationModal";
import { isViewEnabled } from "../viewFeatures";
import { registerRibbonIcons } from "../../bootstrap/pluginBootstrap";
import { createTaskNotesLogger } from "../../utils/tasknotesLogger";
import {
	createVaultFile,
	createVaultFolder,
	modifyVaultFile,
} from "../../services/VaultMutationService";

const tasknotesLogger = createTaskNotesLogger({ tag: "Settings/Tabs/GeneralTab" });

/**
 * Renders the General tab - foundational settings for task identification and storage
 */
export function renderGeneralTab(
	container: HTMLElement,
	plugin: TaskNotesPlugin,
	save: () => void
): void {
	container.empty();

	const translate = (key: TranslationKey, params?: Record<string, string | number>) =>
		plugin.i18n.translate(key, params);

	// Tasks Storage Section
	createSettingGroup(
		container,
		{
			heading: translate("settings.general.taskStorage.header"),
			description: translate("settings.general.taskStorage.description"),
		},
		(group) => {
			group.addSetting(
				(setting) =>
					void configureTextSetting(setting, {
						name: translate("settings.general.taskStorage.defaultFolder.name"),
						desc: translate("settings.general.taskStorage.defaultFolder.description"),
						placeholder: "TASKquence/Tasks",
						getValue: () => plugin.settings.tasksFolder,
						setValue: async (value: string) => {
							plugin.settings.tasksFolder = value;
							save();
						},
						ariaLabel: "Default folder path for new tasks",
					})
			);

			group.addSetting(
				(setting) =>
					void configureTextSetting(setting, {
						name: translate("settings.features.instantConvert.folder.name"),
						desc: translate("settings.features.instantConvert.folder.description"),
						placeholder: "{{currentNotePath}}",
						getValue: () => plugin.settings.inlineTaskConvertFolder,
						setValue: async (value: string) => {
							plugin.settings.inlineTaskConvertFolder = value;
							save();
						},
						ariaLabel: "Folder for inline-created tasks",
					})
			);

			group.addSetting(
				(setting) =>
					void configureToggleSetting(setting, {
						name: translate("settings.general.taskStorage.moveArchived.name"),
						desc: translate("settings.general.taskStorage.moveArchived.description"),
						getValue: () => plugin.settings.moveArchivedTasks,
						setValue: async (value: boolean) => {
							plugin.settings.moveArchivedTasks = value;
							save();
							// Re-render to show/hide archive folder setting
							renderGeneralTab(container, plugin, save);
						},
					})
			);

			if (plugin.settings.moveArchivedTasks) {
				group.addSetting(
					(setting) =>
						void configureTextSetting(setting, {
							name: translate("settings.general.taskStorage.archiveFolder.name"),
							desc: translate(
								"settings.general.taskStorage.archiveFolder.description"
							),
							placeholder: "TASKquence/Archive",
							getValue: () => plugin.settings.archiveFolder,
							setValue: async (value: string) => {
								plugin.settings.archiveFolder = value;
								save();
							},
							ariaLabel: "Archive folder path",
						})
				);
			}
		}
	);

	createSettingGroup(
		container,
		{
			heading: translate("settings.general.taskIdentification.header"),
			description: translate("onboarding.fixedIdentity"),
		},
		(group) => {
			group.addSetting((setting) => {
				setting
					.setName(translate("settings.general.taskIdentification.taskProperty.name"))
					.setDesc(translate("onboarding.fixedIdentityHint"));
			});
		}
	);

	const addViewToggle = (setting: import("obsidian").Setting, id: string) => {
		setting.addToggle((toggle) =>
			toggle
				.setTooltip(translate("onboarding.enableView"))
				.setValue(isViewEnabled(plugin.settings, id))
				.onChange(async (value) => {
					plugin.settings.enabledViews = { ...plugin.settings.enabledViews, [id]: value };
					await plugin.saveSettings();
					registerRibbonIcons(plugin);
					plugin.commandRegistry.refreshTranslations();
					if (value) await plugin.ensureBasesViewFiles();
				})
		);
	};

	// Views & Base Files Section (moved above Folder Management)
	// Command file mappings data
	const commandMappings = [
		{
			id: "open-calendar-view",
			nameKey: "miniCalendar" as const,
			defaultPath: "TASKquence/Views/mini-calendar-default.base",
		},
		{
			id: "open-kanban-view",
			nameKey: "kanban" as const,
			defaultPath: "TASKquence/Views/kanban-default.base",
		},
		{
			id: "open-tasks-view",
			nameKey: "tasks" as const,
			defaultPath: "TASKquence/Views/tasks-default.base",
		},
		{
			id: "open-advanced-calendar-view",
			nameKey: "advancedCalendar" as const,
			defaultPath: "TASKquence/Views/calendar-default.base",
		},
		{
			id: "open-agenda-view",
			nameKey: "agenda" as const,
			defaultPath: "TASKquence/Views/agenda-default.base",
		},
		{
			id: "open-statistics",
			nameKey: "timeStatistics" as const,
			defaultPath: "TASKquence/Views/time-statistics.base",
		},
		{
			id: "pomodoro-stats-base",
			nameKey: "pomodoroStats" as const,
			defaultPath: "TASKquence/Views/pomodoro-stats.base",
		},
		{
			id: "relationships",
			nameKey: "relationships" as const,
			defaultPath: "TASKquence/Views/relationships.base",
		},
	];

	createSettingGroup(
		container,
		{
			heading: translate("settings.integrations.basesIntegration.viewCommands.header"),
			description: translate(
				"settings.integrations.basesIntegration.viewCommands.description"
			),
		},
		(group) => {
			// Additional description
			group.addSetting((setting) => {
				setting.setDesc(
					translate(
						"settings.integrations.basesIntegration.viewCommands.descriptionRegen"
					)
				);
				setting.settingEl.addClass("settings-view__group-description");
			});

			group.addSetting((setting) => {
				setting.setDesc(
					translate(
						"settings.integrations.basesIntegration.viewCommands.pomodoroDailyNotesHint"
					)
				);
				setting.settingEl.addClass("settings-view__group-description");
			});

			// Documentation link
			group.addSetting((setting) => {
				const descEl = setting.descEl;
				const docsLink = descEl.createEl("a", {
					text: translate("settings.integrations.basesIntegration.viewCommands.docsLink"),
					href: translate(
						"settings.integrations.basesIntegration.viewCommands.docsLinkUrl"
					),
				});
				docsLink.setAttr("target", "_blank");
				setting.settingEl.addClass("settings-view__group-description");
			});

			// Command file mappings
			commandMappings.forEach(({ id, nameKey, defaultPath }) => {
				group.addSetting((setting) => {
					const commandName = translate(
						`settings.integrations.basesIntegration.viewCommands.commands.${nameKey}`
					);
					setting.setName(commandName);
					addViewToggle(setting, id);
					setting.setDesc(
						translate("settings.integrations.basesIntegration.viewCommands.fileLabel", {
							path: plugin.settings.commandFileMapping[id],
						})
					);

					// Text input for file path
					setting.addText((text) => {
						text.setPlaceholder(defaultPath)
							.setValue(plugin.settings.commandFileMapping[id])
							.onChange((value) => {
								plugin.settings.commandFileMapping[id] = value;
								save();
								// Update description
								setting.setDesc(
									translate(
										"settings.integrations.basesIntegration.viewCommands.fileLabel",
										{
											path: value,
										}
									)
								);
							});
						text.inputEl.classList.remove(
							"tn-static-width-12px-fbf353fb",
							"tn-static-width-16px-7375d50b",
							"tn-static-width-1px-aa77e27e",
							"tn-static-width-200px-2acaf3b5",
							"tn-static-width-60px-bd09c419",
							"tn-static-width-80px-8573bae3"
						);
						text.inputEl.classList.add("tn-static-width-100-0466783d");
						return text;
					});

					// Reset button
					setting.addButton((button) => {
						button
							.setButtonText(
								translate(
									"settings.integrations.basesIntegration.viewCommands.resetButton"
								)
							)
							.setTooltip(
								translate(
									"settings.integrations.basesIntegration.viewCommands.resetTooltip"
								)
							)
							.onClick(() => {
								plugin.settings.commandFileMapping[id] = defaultPath;
								save();
								// Refresh the entire settings display
								if (plugin.app.setting.activeTab) {
									plugin.app.setting.openTabById(plugin.app.setting.activeTab.id);
								}
							});
						return button;
					});
				});
			});

			for (const [id, nameKey] of [
				["open-pomodoro-view", "commands.openPomodoroView"],
				["open-pomodoro-stats", "commands.openPomodoroStats"],
			]) {
				group.addSetting((setting) => {
					setting.setName(translate(nameKey));
					addViewToggle(setting, id);
				});
			}

			group.addSetting((setting) => {
				setting
					.setName(translate("onboarding.restoreExamples"))
					.setDesc(translate("onboarding.restoreExamplesHint"))
					.addButton((button) =>
						button
							.setButtonText(translate("onboarding.restoreExamples"))
							.onClick(async () => {
								await ensureExampleTasks(plugin, { restoreMissing: true });
								new Notice(translate("onboarding.examplesRestored"));
							})
					);
			});

			// Auto-create default files toggle
			group.addSetting((setting) => {
				setting
					.setName(
						translate(
							"settings.integrations.basesIntegration.autoCreateDefaultFiles.name"
						)
					)
					.setDesc(
						translate(
							"settings.integrations.basesIntegration.autoCreateDefaultFiles.description"
						)
					)
					.addToggle((toggle) => {
						toggle
							.setValue(plugin.settings.autoCreateDefaultBasesFiles)
							.onChange((value) => {
								plugin.settings.autoCreateDefaultBasesFiles = value;
								save();
							});
						return toggle;
					});
			});

			// Create Default Files button
			group.addSetting((setting) => {
				setting
					.setName(
						translate("settings.integrations.basesIntegration.createDefaultFiles.name")
					)
					.setDesc(
						translate(
							"settings.integrations.basesIntegration.createDefaultFiles.description"
						)
					)
					.addButton((button) => {
						button
							.setButtonText(
								translate(
									"settings.integrations.basesIntegration.createDefaultFiles.buttonText"
								)
							)
							.setCta()
							.onClick(async () => {
								await plugin.createDefaultBasesFiles();
							});
						return button;
					});
			});

			// Update Default Files button
			group.addSetting((setting) => {
				setting
					.setName(
						translate("settings.integrations.basesIntegration.updateDefaultFiles.name")
					)
					.setDesc(
						translate(
							"settings.integrations.basesIntegration.updateDefaultFiles.description"
						)
					)
					.addButton((button) => {
						button
							.setButtonText(
								translate(
									"settings.integrations.basesIntegration.updateDefaultFiles.buttonText"
								)
							)
							.onClick(async () => {
								const confirmed = await showConfirmationModal(plugin.app, {
									title: translate(
										"settings.integrations.basesIntegration.updateDefaultFiles.confirmTitle"
									),
									message: translate(
										"settings.integrations.basesIntegration.updateDefaultFiles.confirmMessage"
									),
									confirmText: translate(
										"settings.integrations.basesIntegration.updateDefaultFiles.confirmText"
									),
									isDestructive: false,
								});
								if (!confirmed) {
									return;
								}

								await plugin.createDefaultBasesFiles({ overwriteExisting: true });
							});
						return button;
					});
			});

			// Export All Saved Views button
			group.addSetting((setting) => {
				setting
					.setName(translate("settings.integrations.basesIntegration.exportV3Views.name"))
					.setDesc(
						translate(
							"settings.integrations.basesIntegration.exportV3Views.description"
						)
					)
					.addButton((button) => {
						button
							.setButtonText(
								translate(
									"settings.integrations.basesIntegration.exportV3Views.buttonText"
								)
							)
							.onClick(async () => {
								try {
									const savedViews = plugin.viewStateManager.getSavedViews();

									if (savedViews.length === 0) {
										new Notice(
											translate(
												"settings.integrations.basesIntegration.exportV3Views.noViews"
											)
										);
										return;
									}

									const basesContent =
										plugin.basesFilterConverter.convertAllSavedViewsToBasesFile(
											savedViews
										);
									const fileName = "all-saved-views.base";
									const filePath = `TASKquence/Views/${fileName}`;

									// Create folder if needed (check on-disk via adapter, not in-memory cache)
									if (
										!(await plugin.app.vault.adapter.exists("TASKquence/Views"))
									) {
										await createVaultFolder(plugin.app, "TASKquence/Views");
									}

									// Handle file overwrite confirmation
									const existingFile =
										plugin.app.vault.getAbstractFileByPath(filePath);
									if (existingFile) {
										if (!(existingFile instanceof TFile)) {
											throw new Error(`${filePath} exists but is not a file`);
										}
										const confirmed = await showConfirmationModal(plugin.app, {
											title: translate(
												"settings.integrations.basesIntegration.exportV3Views.fileExists"
											),
											message: translate(
												"settings.integrations.basesIntegration.exportV3Views.confirmOverwrite",
												{ fileName }
											),
											isDestructive: false,
										});
										if (!confirmed) return;
										await modifyVaultFile(
											plugin.app,
											existingFile,
											basesContent
										);
									} else {
										await createVaultFile(plugin.app, filePath, basesContent);
									}

									new Notice(
										translate(
											"settings.integrations.basesIntegration.exportV3Views.success",
											{
												count: savedViews.length.toString(),
												filePath,
											}
										)
									);
									await plugin.app.workspace.openLinkText(filePath, "", true);
								} catch (error) {
									tasknotesLogger.error("Error exporting all views to Bases:", {
										category: "provider",
										operation: "exporting-all-views-bases",
										error: error,
									});
									new Notice(
										translate(
											"settings.integrations.basesIntegration.exportV3Views.error",
											{
												message: error.message,
											}
										)
									);
								}
							});
						return button;
					});
			});
		}
	);

	// Folder Management Section
	createSettingGroup(
		container,
		{ heading: translate("settings.general.folderManagement.header") },
		(group) => {
			group.addSetting(
				(setting) =>
					void configureTextSetting(setting, {
						name: translate("settings.general.folderManagement.excludedFolders.name"),
						desc: translate(
							"settings.general.folderManagement.excludedFolders.description"
						),
						placeholder: "Templates, Archive",
						getValue: () => plugin.settings.excludedFolders,
						setValue: async (value: string) => {
							plugin.settings.excludedFolders = value;
							save();
						},
						ariaLabel: "Excluded folder paths",
					})
			);
		}
	);

	// UI Language Section
	const uiLanguageOptions = (() => {
		const options: Array<{ value: string; label: string }> = [
			{ value: "system", label: translate("common.systemDefault") },
		];
		for (const code of plugin.i18n.getAvailableLocales()) {
			// Use native language names (endonyms) for better UX
			const label = plugin.i18n.getNativeLanguageName(code);
			options.push({ value: code, label });
		}
		return options;
	})();

	createSettingGroup(
		container,
		{
			heading: translate("settings.features.uiLanguage.header"),
			description: translate("settings.features.uiLanguage.description"),
		},
		(group) => {
			group.addSetting(
				(setting) =>
					void configureDropdownSetting(setting, {
						name: translate("settings.features.uiLanguage.dropdown.name"),
						desc: translate("settings.features.uiLanguage.dropdown.description"),
						options: uiLanguageOptions,
						getValue: () => plugin.settings.uiLanguage ?? "system",
						setValue: async (value: string) => {
							plugin.settings.uiLanguage = value;
							plugin.i18n.setLocale(value);
							save();
							renderGeneralTab(container, plugin, save);
						},
					})
			);
		}
	);

	// Frontmatter Section - only show if user has markdown links enabled globally
	const useMarkdownLinks = plugin.app.vault.getConfig("useMarkdownLinks");
	if (useMarkdownLinks) {
		createSettingGroup(
			container,
			{
				heading: translate("settings.general.frontmatter.header"),
				description: translate("settings.general.frontmatter.description"),
			},
			(group) => {
				group.addSetting(
					(setting) =>
						void configureToggleSetting(setting, {
							name: translate("settings.general.frontmatter.useMarkdownLinks.name"),
							desc: translate(
								"settings.general.frontmatter.useMarkdownLinks.description"
							),
							getValue: () => plugin.settings.useFrontmatterMarkdownLinks,
							setValue: async (value: boolean) => {
								plugin.settings.useFrontmatterMarkdownLinks = value;
								save();
							},
						})
				);
			}
		);
	}

	// Release Notes Section
	createSettingGroup(
		container,
		{
			heading: translate("settings.general.releaseNotes.header"),
			description: translate("settings.general.releaseNotes.description", {
				version: plugin.manifest.version,
			}),
		},
		(group) => {
			group.addSetting(
				(setting) =>
					void configureToggleSetting(setting, {
						name: translate("settings.general.releaseNotes.showOnUpdate.name"),
						desc: translate("settings.general.releaseNotes.showOnUpdate.description"),
						getValue: () => plugin.settings.showReleaseNotesOnUpdate ?? true,
						setValue: async (value: boolean) => {
							plugin.settings.showReleaseNotesOnUpdate = value;
							save();
						},
					})
			);

			group.addSetting(
				(setting) =>
					void configureToggleSetting(setting, {
						name: translate("settings.general.releaseNotes.checkForUpdates.name"),
						desc: translate(
							"settings.general.releaseNotes.checkForUpdates.description"
						),
						getValue: () => plugin.settings.checkForUpdatesOnStartup ?? true,
						setValue: async (value: boolean) => {
							plugin.settings.checkForUpdatesOnStartup = value;
							save();
						},
					})
			);

			group.addSetting((setting) => {
				setting
					.setName(translate("settings.general.releaseNotes.viewButton.name"))
					.setDesc(translate("settings.general.releaseNotes.viewButton.description"))
					.addButton((button) =>
						button
							.setButtonText(
								translate("settings.general.releaseNotes.viewButton.buttonText")
							)
							.setCta()
							.onClick(async () => {
								await plugin.activateReleaseNotesView();
							})
					);
			});
		}
	);
}
