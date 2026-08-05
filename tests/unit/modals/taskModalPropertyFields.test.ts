import {
	createTaskModalChoiceField,
	createTaskModalValueField,
} from "../../../src/modals/taskModalPropertyFields";

describe("taskModalPropertyFields", () => {
	beforeEach(() => {
		document.body.innerHTML = "";
	});

	it("renders accessible choices and updates the selected value", () => {
		const container = document.createElement("div");
		const onChange = jest.fn();
		const control = createTaskModalChoiceField({
			container,
			fieldId: "status",
			label: "Status",
			choices: [
				{ value: "open", label: "Not started" },
				{ value: "in-progress", label: "In progress" },
			],
			value: "open",
			onChange,
		});

		const buttons = Array.from(container.querySelectorAll<HTMLButtonElement>("button"));
		const icon = container.querySelector<HTMLElement>(
			".tn-task-modal__property-label-icon"
		);
		expect(icon?.dataset.icon).toBe("circle-dot");
		expect(buttons.map((button) => button.getAttribute("aria-pressed"))).toEqual([
			"true",
			"false",
		]);

		buttons[1].click();
		expect(onChange).toHaveBeenCalledWith("in-progress");
		expect(buttons[1].getAttribute("aria-pressed")).toBe("true");

		control.update("open");
		expect(buttons[0].getAttribute("aria-pressed")).toBe("true");
	});

	it("updates value rows without rebuilding the field", () => {
		const container = document.createElement("div");
		const control = createTaskModalValueField({
			container,
			fieldId: "scheduled-date",
			label: "Scheduled date",
			value: "",
			emptyText: "Not set",
			onClick: jest.fn(),
		});
		const button = container.querySelector<HTMLButtonElement>("button");
		const labelIcon = container.querySelector<HTMLElement>(
			".tn-task-modal__property-label-icon"
		);

		expect(button?.textContent).toBe("Not set");
		expect(labelIcon?.dataset.icon).toBe("calendar-days");
		expect(button?.querySelector(".tn-task-modal__value-icon")).toBeNull();
		expect(button?.classList.contains("is-empty")).toBe(true);

		control.update("Aug 4, 2026");
		expect(button?.textContent).toBe("Aug 4, 2026");
		expect(button?.classList.contains("is-empty")).toBe(false);
	});
});
