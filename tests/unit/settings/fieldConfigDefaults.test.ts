import {
	createDefaultFieldConfig,
	initializeFieldConfig,
} from "../../../src/utils/fieldConfigDefaults";
import type { TaskModalFieldsConfig } from "../../../src/types/settings";

describe("task modal field defaults", () => {
	it("includes every property exposed by the unified task sheet", () => {
		const config = createDefaultFieldConfig();
		const ids = config.fields.map((field) => field.id);

		expect(config.version).toBe(2);
		expect(ids).toEqual(
			expect.arrayContaining([
				"title",
				"status",
				"priority",
				"due-date",
				"scheduled-date",
				"projects",
				"tags",
				"details",
				"recurrence",
				"reminders",
				"time-tracking",
			])
		);
		const tracking = config.fields.find((field) => field.id === "time-tracking");
		expect(tracking).toMatchObject({
			visibleInCreation: false,
			visibleInEdit: true,
		});
	});

	it("upgrades legacy configs while preserving visibility choices and custom fields", () => {
		const legacy: TaskModalFieldsConfig = {
			version: 1,
			groups: createDefaultFieldConfig().groups,
			fields: [
				{
					id: "title",
					fieldType: "core",
					group: "basic",
					displayName: "Title",
					visibleInCreation: false,
					visibleInEdit: true,
					order: 0,
					enabled: true,
				},
				{
					id: "effort",
					fieldType: "user",
					group: "custom",
					displayName: "Effort",
					visibleInCreation: true,
					visibleInEdit: true,
					order: 0,
					enabled: true,
				},
			],
		};

		const migrated = initializeFieldConfig(legacy);

		expect(migrated.version).toBe(2);
		expect(migrated.fields.find((field) => field.id === "title")?.visibleInCreation).toBe(
			false
		);
		expect(migrated.fields.some((field) => field.id === "status")).toBe(true);
		expect(migrated.fields.some((field) => field.id === "effort")).toBe(true);
	});
});
