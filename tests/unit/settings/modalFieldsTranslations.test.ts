import { createI18nService } from "../../../src/i18n";

describe("modal fields settings translations", () => {
	it("provides Chinese labels for the complete configuration surface", () => {
		const i18n = createI18nService({ initialLocale: "zh" });
		const english = createI18nService({ initialLocale: "en" });
		const keys = [
			"settings.modalFields.heading",
			"settings.modalFields.description",
			"settings.modalFields.splitLayout.name",
			"settings.modalFields.splitLayout.description",
			"settings.modalFields.tabMovesFocus.name",
			"settings.modalFields.tabMovesFocus.description",
			"settings.modalFields.sync.name",
			"settings.modalFields.sync.description",
			"settings.modalFields.sync.button",
			"settings.modalFields.reset.name",
			"settings.modalFields.reset.description",
			"settings.modalFields.reset.button",
			"settings.modalFields.groups.basic",
			"settings.modalFields.groups.metadata",
			"settings.modalFields.groups.organization",
			"settings.modalFields.groups.dependencies",
			"settings.modalFields.groups.custom",
			"settings.modalFields.fields.title",
			"settings.modalFields.fieldTypes.core",
			"settings.modalFields.controls.enabled",
			"settings.modalFields.controls.showInCreation",
			"settings.modalFields.controls.showInEdit",
			"settings.modalFields.controls.group",
		];

		for (const key of keys) {
			const translated = i18n.translate(key);
			expect(translated).not.toBe(key);
			expect(translated).not.toBe(english.translate(key));
		}
	});
});
