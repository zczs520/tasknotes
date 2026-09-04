import { KanbanTimeFilterControls } from "../../../src/bases/components/KanbanTimeFilterControls";
import { renderTag } from "../../../src/ui/renderers/tagRenderer";

describe("Kanban time filter controls", () => {
	it("renders the preset order and exposes a field selector beside the calendar", () => {
		const container = document.createElement("div");
		const onChooseField = jest.fn();
		const onSelectPreset = jest.fn();
		const controls = new KanbanTimeFilterControls({
			container,
			field: "scheduled",
			preset: "this-week",
			labels: {
				ariaLabel: "按计划时间筛选",
				fieldButtonLabel: "时间筛选依据：计划时间",
				today: "今日",
				yesterday: "昨日",
				thisWeek: "本周",
				lastWeek: "上周",
				all: "全部",
				custom: "自定义时间",
			},
			onChooseField,
			onSelectPreset,
		});

		const fieldButton = container.querySelector<HTMLButtonElement>(
			".tn-kanban-time-filter__field-button"
		);
		const presetButtons = Array.from(
			container.querySelectorAll<HTMLButtonElement>("[data-preset]")
		);
		expect(fieldButton?.dataset.field).toBe("scheduled");
		expect(fieldButton?.getAttribute("aria-label")).toBe("时间筛选依据：计划时间");
		expect(presetButtons.map((button) => button.textContent)).toEqual([
			"今日",
			"昨日",
			"本周",
			"上周",
			"全部",
			"自定义时间",
		]);
		expect(presetButtons[2].getAttribute("aria-pressed")).toBe("true");

		fieldButton?.click();
		expect(onChooseField).toHaveBeenCalledWith(fieldButton);

		presetButtons[3].click();
		expect(onSelectPreset).toHaveBeenCalledWith("last-week");
		controls.update("completed", "last-week", {
			ariaLabel: "按完成时间筛选",
			fieldButtonLabel: "时间筛选依据：完成时间",
		});
		expect(fieldButton?.dataset.field).toBe("completed");
		expect(presetButtons[3].getAttribute("aria-pressed")).toBe("true");
		expect(presetButtons[2].getAttribute("aria-pressed")).toBe("false");
	});
});

describe("display-only Kanban tags", () => {
	it("lets the card receive the click instead of triggering tag search", () => {
		const card = document.createElement("div");
		const metadata = document.createElement("div");
		const onTagClick = jest.fn();
		const onCardClick = jest.fn();
		card.appendChild(metadata);
		card.addEventListener("click", onCardClick);

		renderTag(metadata, "PartnerShare", { interactive: false, onTagClick });
		const tag = metadata.querySelector(".tag") as HTMLElement;
		tag.click();

		expect(tag.tagName).toBe("SPAN");
		expect(tag.hasAttribute("data-tn-click-exclude")).toBe(false);
		expect(onTagClick).not.toHaveBeenCalled();
		expect(onCardClick).toHaveBeenCalledTimes(1);
	});
});
