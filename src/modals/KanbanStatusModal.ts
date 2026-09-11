import { Modal, Notice, Setting } from "obsidian";
import type TaskNotesPlugin from "../main";
import type { StatusConfig } from "../types";
import { showConfirmationModal } from "./ConfirmationModal";

export async function saveKanbanStatus(
	plugin: TaskNotesPlugin,
	statusId: string,
	draft: StatusConfig,
	onChanged?: () => void | Promise<void>
): Promise<boolean> {
	const current = plugin.settings.customStatuses.find((item) => item.id === statusId);
	if (!current || !draft.label.trim()) return false;
	Object.assign(current, {
		label: draft.label.trim(),
		color: draft.color,
		icon: draft.icon,
		isCompleted: draft.isCompleted,
	});
	await plugin.saveSettings();
	await onChanged?.();
	return true;
}

export class KanbanStatusModal extends Modal {
	constructor(
		private plugin: TaskNotesPlugin,
		private statusId: string,
		private onChanged?: () => void | Promise<void>
	) {
		super(plugin.app);
	}

	onOpen(): void {
		const status = this.plugin.settings.customStatuses.find(
			(item) => item.id === this.statusId
		);
		if (!status) {
			this.close();
			return;
		}
		const draft: StatusConfig = { ...status };
		const t = (key: string) => this.plugin.i18n.translate(key);
		this.setTitle(t("onboarding.editStatus"));
		new Setting(this.contentEl)
			.setName(t("settings.taskProperties.taskStatuses.placeholders.label"))
			.addText((input) =>
				input.setValue(draft.label).onChange((value) => {
					draft.label = value;
				})
			);
		new Setting(this.contentEl)
			.setName(t("settings.taskProperties.taskStatuses.placeholders.value"))
			.setDesc(draft.value);
		new Setting(this.contentEl).setName(t("onboarding.statusColor")).addColorPicker((input) =>
			input.setValue(draft.color).onChange((value) => {
				draft.color = value;
			})
		);
		new Setting(this.contentEl)
			.setName(t("settings.taskProperties.taskStatuses.placeholders.icon"))
			.addText((input) =>
				input.setValue(draft.icon ?? "").onChange((value) => {
					draft.icon = value;
				})
			);
		new Setting(this.contentEl)
			.setName(t("settings.taskProperties.taskStatuses.badges.completed"))
			.addToggle((input) =>
				input.setValue(draft.isCompleted).onChange((value) => {
					draft.isCompleted = value;
				})
			);
		new Setting(this.contentEl)
			.addButton((button) =>
				button.setButtonText(t("common.cancel")).onClick(() => this.close())
			)
			.addButton((button) =>
				button
					.setButtonText(t("common.save"))
					.setCta()
					.onClick(async () => {
						if (!draft.label.trim()) {
							new Notice(t("onboarding.statusLabelRequired"));
							return;
						}
						if (
							!(await saveKanbanStatus(
								this.plugin,
								this.statusId,
								draft,
								this.onChanged
							))
						) {
							this.close();
							return;
						}
						new Notice(t("onboarding.statusSaved"), 8000);
						this.close();
					})
			);
	}

	onClose(): void {
		this.contentEl.empty();
	}
}

export async function deleteKanbanStatus(
	plugin: TaskNotesPlugin,
	statusId: string,
	onChanged?: () => void | Promise<void>
): Promise<boolean> {
	const status = plugin.settings.customStatuses.find((item) => item.id === statusId);
	if (!status) return false;
	const t = (key: string) => plugin.i18n.translate(key);
	if (plugin.settings.customStatuses.length <= 1) {
		new Notice(t("onboarding.keepOneStatus"));
		return false;
	}
	if (
		!(await showConfirmationModal(plugin.app, {
			title: t("onboarding.deleteStatus"),
			message: `${status.label}\n\n${t("onboarding.deleteStatusHint")}`,
			confirmText: t("onboarding.deleteStatus"),
			cancelText: t("common.cancel"),
			isDestructive: true,
		}))
	)
		return false;
	if (plugin.settings.customStatuses.length <= 1) return false;
	plugin.settings.customStatuses = plugin.settings.customStatuses.filter(
		(item) => item.id !== statusId
	);
	plugin.settings.customStatuses.forEach((item, index) => {
		item.order = index;
		if (item.nextStatus === status.value) delete item.nextStatus;
	});
	if (plugin.settings.defaultTaskStatus === status.value) {
		plugin.settings.defaultTaskStatus = plugin.settings.customStatuses[0].value;
	}
	await plugin.saveSettings();
	await onChanged?.();
	new Notice(t("onboarding.statusDeleted"), 8000);
	return true;
}
