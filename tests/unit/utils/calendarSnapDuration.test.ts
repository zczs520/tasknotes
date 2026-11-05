import {
	normalizeCalendarSnapDuration,
	resolveCalendarSnapDuration,
} from "../../../src/utils/calendarTime";
import { DEFAULT_CALENDAR_VIEW_SETTINGS } from "../../../src/settings/defaults";

describe("calendar snap duration setting", () => {
	it("keeps the existing behaviour by default", () => {
		expect(DEFAULT_CALENDAR_VIEW_SETTINGS.snapDuration).toBe("");
		expect(resolveCalendarSnapDuration("", "00:30:00")).toBe("00:30:00");
		expect(resolveCalendarSnapDuration(undefined, "00:15:00")).toBe("00:15:00");
	});

	it("accepts a number of minutes for fine-grained dragging", () => {
		expect(normalizeCalendarSnapDuration("1")).toEqual({
			value: "00:01:00",
			isValid: true,
		});
		expect(normalizeCalendarSnapDuration("5")).toEqual({
			value: "00:05:00",
			isValid: true,
		});
		expect(normalizeCalendarSnapDuration("60")).toEqual({
			value: "01:00:00",
			isValid: true,
		});
	});

	it("accepts HH:mm:ss and HH:mm values", () => {
		expect(normalizeCalendarSnapDuration("00:01:00")).toEqual({
			value: "00:01:00",
			isValid: true,
		});
		expect(normalizeCalendarSnapDuration("00:05")).toEqual({
			value: "00:05:00",
			isValid: true,
		});
	});

	it("treats an empty value as 'follow the slot duration'", () => {
		expect(normalizeCalendarSnapDuration("  ")).toEqual({
			value: "",
			isValid: true,
		});
	});

	it("rejects zero, out-of-range and malformed values", () => {
		expect(normalizeCalendarSnapDuration("0").isValid).toBe(false);
		expect(normalizeCalendarSnapDuration("121").isValid).toBe(false);
		expect(normalizeCalendarSnapDuration("00:00:00").isValid).toBe(false);
		expect(normalizeCalendarSnapDuration("abc").isValid).toBe(false);
	});

	it("lets the global setting win over the slot duration", () => {
		expect(resolveCalendarSnapDuration("00:01:00", "00:30:00")).toBe("00:01:00");
		expect(resolveCalendarSnapDuration("1", "00:30:00")).toBe("00:01:00");
		expect(resolveCalendarSnapDuration("00:05:00", "00:15:00")).toBe("00:05:00");
	});

	it("falls back when the global value is invalid", () => {
		expect(resolveCalendarSnapDuration("nonsense", "00:30:00")).toBe("00:30:00");
	});
});
