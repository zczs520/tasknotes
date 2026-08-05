import type {
	ModalFieldConfigLike,
	ModalFieldsConfigLike,
} from "../../../src/modals/taskModalFieldConfig";
import {
	renderTaskModalField,
	renderTaskModalFieldGroups,
	type TaskModalFieldRendererMap,
} from "../../../src/modals/taskModalFieldRenderer";

function createConfig(): ModalFieldsConfigLike {
	return {
		groups: [
			{ id: "basic", order: 0 },
			{ id: "metadata", order: 1 },
			{ id: "custom", order: 2 },
		],
		fields: [
			{
				id: "title",
				fieldType: "core",
				group: "basic",
				order: 0,
				enabled: true,
				visibleInCreation: true,
				visibleInEdit: true,
			},
			{
				id: "contexts",
				fieldType: "core",
				group: "metadata",
				order: 0,
				enabled: true,
				visibleInCreation: true,
				visibleInEdit: true,
			},
			{
				id: "unknown-core",
				fieldType: "core",
				group: "metadata",
				order: 1,
				enabled: true,
				visibleInCreation: true,
				visibleInEdit: true,
			},
			{
				id: "custom-rating",
				fieldType: "user",
				group: "custom",
				order: 0,
				enabled: true,
				visibleInCreation: true,
				visibleInEdit: true,
			},
		] as unknown as ModalFieldConfigLike[],
	};
}

describe("taskModalFieldRenderer", () => {
	beforeEach(() => {
		document.body.innerHTML = "";
		jest.clearAllMocks();
	});

	it("renders non-basic field groups through core and user renderers", () => {
		const container = document.createElement("div");
		const renderContexts = jest.fn((fieldContainer: HTMLElement) => {
			fieldContainer.createDiv({ text: "contexts" });
		});
		const renderUserField = jest.fn((fieldContainer: HTMLElement) => {
			fieldContainer.createDiv({ text: "user field" });
		});
		const fieldRenderers: Partial<TaskModalFieldRendererMap> = {
			contexts: renderContexts,
		};

		const result = renderTaskModalFieldGroups({
			container,
			config: createConfig(),
			isCreationMode: true,
			fieldRenderers,
			renderUserField,
		});

		const groupContainers = container.querySelectorAll(".task-modal__field-group");
		const fieldContainers = container.querySelectorAll(".tn-task-modal__field");
		expect(groupContainers).toHaveLength(2);
		expect(container.textContent).toBe("contextsuser field");
		expect(renderContexts).toHaveBeenCalledWith(
			fieldContainers[0],
			expect.objectContaining({ id: "contexts" })
		);
		expect(renderUserField).toHaveBeenCalledWith(
			fieldContainers[1],
			expect.objectContaining({ id: "custom-rating" })
		);
		expect(result).toEqual({
			groupsRendered: 2,
			fieldsRendered: 2,
			ignoredFieldIds: ["unknown-core"],
		});
	});

	it("renders user fields assigned to Basic Information while leaving layout fields to the modal", () => {
		const container = document.createElement("div");
		const config = createConfig();
		config.fields?.push({
			id: "reviewed",
			fieldType: "user",
			group: "basic",
			order: 2,
			enabled: true,
			visibleInCreation: true,
			visibleInEdit: true,
		} as ModalFieldConfigLike);

		const renderUserField = jest.fn((fieldContainer: HTMLElement, fieldConfig) => {
			fieldContainer.createDiv({ text: fieldConfig.id });
		});

		const result = renderTaskModalFieldGroups({
			container,
			config,
			isCreationMode: false,
			fieldRenderers: {
				contexts: (fieldContainer) => fieldContainer.createDiv({ text: "contexts" }),
			},
			renderUserField,
		});

		const groupContainers = container.querySelectorAll(".task-modal__field-group");
		const reviewedField = container.querySelector<HTMLElement>(
			'[data-task-modal-field-id="reviewed"]'
		);
		expect(groupContainers).toHaveLength(3);
		expect(groupContainers[0].textContent).toBe("reviewed");
		expect(renderUserField).toHaveBeenCalledWith(
			reviewedField,
			expect.objectContaining({ group: "basic", id: "reviewed" })
		);
		expect(renderUserField).not.toHaveBeenCalledWith(
			expect.any(HTMLElement),
			expect.objectContaining({ id: "title" })
		);
		expect(renderUserField).not.toHaveBeenCalledWith(
			expect.any(HTMLElement),
			expect.objectContaining({ id: "details" })
		);
		expect(result).toEqual({
			groupsRendered: 3,
			fieldsRendered: 3,
			ignoredFieldIds: ["unknown-core"],
		});
	});

	it("honors modal visibility filtering before rendering groups", () => {
		const container = document.createElement("div");
		const config = createConfig();
		const contextsField = config.fields?.find((field) => field.id === "contexts");
		if (contextsField) {
			contextsField.visibleInEdit = false;
		}
		const renderContexts = jest.fn();

		const result = renderTaskModalFieldGroups({
			container,
			config,
			isCreationMode: false,
			fieldRenderers: { contexts: renderContexts },
			renderUserField: jest.fn(),
		});

		expect(renderContexts).not.toHaveBeenCalled();
		expect(container.querySelectorAll(".task-modal__field-group")).toHaveLength(2);
		expect(result.fieldsRendered).toBe(1);
		expect(result.ignoredFieldIds).toEqual(["unknown-core"]);
	});

	it("places the four default properties first in the requested display order", () => {
		const container = document.createElement("div");
		const config = createConfig();
		config.fields?.push(
			...([
				{ id: "tags", group: "metadata", order: 9 },
				{ id: "scheduled-date", group: "basic", order: 8 },
				{ id: "priority", group: "custom", order: 7 },
				{ id: "status", group: "metadata", order: 6 },
			].map((field) => ({
				...field,
				fieldType: "core",
				enabled: true,
				visibleInCreation: true,
				visibleInEdit: true,
			})) as ModalFieldConfigLike[])
		);

		renderTaskModalFieldGroups({
			container,
			config,
			isCreationMode: true,
			fieldRenderers: Object.fromEntries(
				["status", "priority", "scheduled-date", "tags", "contexts"].map((id) => [
					id,
					(fieldContainer: HTMLElement) => fieldContainer.createDiv({ text: id }),
				])
			),
			renderUserField: (fieldContainer) => fieldContainer.createDiv({ text: "user" }),
		});

		const fieldOrder = Array.from(
			container.querySelectorAll<HTMLElement>("[data-task-modal-field-id]")
		).map((field) => field.dataset.taskModalFieldId);
		expect(fieldOrder.slice(0, 4)).toEqual(["status", "priority", "scheduled-date", "tags"]);
		expect(
			container.firstElementChild?.classList.contains(
				"task-modal__field-group--has-essential"
			)
		).toBe(true);
	});

	it("renders a single core or user field through the matching renderer", () => {
		const container = document.createElement("div");
		const renderContexts = jest.fn();
		const renderUserField = jest.fn();

		expect(
			renderTaskModalField({
				container,
				fieldConfig: { id: "contexts" },
				fieldRenderers: { contexts: renderContexts },
				renderUserField,
			})
		).toBe(true);
		expect(renderContexts).toHaveBeenCalledWith(container, { id: "contexts" });

		expect(
			renderTaskModalField({
				container,
				fieldConfig: { id: "custom-rating", fieldType: "user" },
				fieldRenderers: {},
				renderUserField,
			})
		).toBe(true);
		expect(renderUserField).toHaveBeenCalledWith(container, {
			id: "custom-rating",
			fieldType: "user",
		});
	});

	it("adds a consistent property icon to Setting-style labels", () => {
		const container = document.createElement("div");

		renderTaskModalField({
			container,
			fieldConfig: { id: "tags" },
			fieldRenderers: {
				tags: (fieldContainer) => {
					fieldContainer.createDiv({ cls: "setting-item-name", text: "Tags" });
				},
			},
			renderUserField: jest.fn(),
		});

		const label = container.querySelector(".setting-item-name");
		const icon = label?.querySelector<HTMLElement>(
			".tn-task-modal__property-label-icon"
		);
		expect(label?.classList.contains("tn-task-modal__property-label")).toBe(true);
		expect(icon?.dataset.icon).toBe("tags");
	});

	it("ignores unknown non-user fields", () => {
		const rendered = renderTaskModalField({
			container: document.createElement("div"),
			fieldConfig: { id: "unknown-core", fieldType: "core" },
			fieldRenderers: {},
			renderUserField: jest.fn(),
		});

		expect(rendered).toBe(false);
	});
});
