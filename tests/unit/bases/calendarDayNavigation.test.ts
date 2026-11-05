import {
	CALENDAR_DAY_NAVIGATION_BUTTONS,
	CALENDAR_DAY_NAVIGATION_TOOLBAR,
} from "../../../src/bases/calendarDayNavigation";

describe("calendar day navigation toolbar", () => {
	it("orders the navigation buttons as << < > >>", () => {
		expect([...CALENDAR_DAY_NAVIGATION_BUTTONS]).toEqual([
			"prevPeriod",
			"prevDay",
			"nextDay",
			"nextPeriod",
		]);
	});

	it("keeps the existing toolbar buttons after the navigation group", () => {
		expect(
			CALENDAR_DAY_NAVIGATION_TOOLBAR.startsWith(
				"prevPeriod,prevDay,nextDay,nextPeriod"
			)
		).toBe(true);
		expect(CALENDAR_DAY_NAVIGATION_TOOLBAR).toContain("todayAligned");
		expect(CALENDAR_DAY_NAVIGATION_TOOLBAR).toContain("refreshCalendars");
	});
});
