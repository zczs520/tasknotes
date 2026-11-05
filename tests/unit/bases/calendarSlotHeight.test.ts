import {
	applyCalendarSlotHeight,
	CALENDAR_SLOT_HEIGHT_DEFAULT,
	CALENDAR_SLOT_HEIGHT_MAX,
	CALENDAR_SLOT_HEIGHT_MIN,
	CALENDAR_SLOT_HEIGHT_VAR,
	normalizeCalendarSlotHeight,
} from "../../../src/bases/calendarSlotHeight";

describe("calendar slot height", () => {
	it("clamps the configured slot height into the supported range", () => {
		expect(normalizeCalendarSlotHeight(undefined)).toBe(CALENDAR_SLOT_HEIGHT_DEFAULT);
		expect(normalizeCalendarSlotHeight("not a number")).toBe(CALENDAR_SLOT_HEIGHT_DEFAULT);
		expect(normalizeCalendarSlotHeight(1)).toBe(CALENDAR_SLOT_HEIGHT_MIN);
		expect(normalizeCalendarSlotHeight(500)).toBe(CALENDAR_SLOT_HEIGHT_MAX);
		expect(normalizeCalendarSlotHeight(11.6)).toBe(12);
	});

	it("writes the slot height as an inherited CSS custom property", () => {
		const calendarEl = document.createElement("div");

		applyCalendarSlotHeight(calendarEl, 9);

		expect(calendarEl.style.getPropertyValue(CALENDAR_SLOT_HEIGHT_VAR)).toBe("9px");
		expect(calendarEl.dataset.tnSlotHeight).toBe("9");

		applyCalendarSlotHeight(calendarEl, 999);

		expect(calendarEl.style.getPropertyValue(CALENDAR_SLOT_HEIGHT_VAR)).toBe(
			`${CALENDAR_SLOT_HEIGHT_MAX}px`
		);
	});

	it("ignores missing calendar elements", () => {
		expect(() => applyCalendarSlotHeight(null, 12)).not.toThrow();
	});
});
