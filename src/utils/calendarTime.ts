export const CALENDAR_END_TIME_MAX_HOUR = 48;

export type CalendarTimeValidationOptions = {
	maxHour?: number;
	allowMaxHourOnlyAtZero?: boolean;
};

export type CalendarTimeValidationResult = {
	value: string;
	isValid: boolean;
};

export function normalizeCalendarTimeValue(
	value: string | undefined,
	defaultValue: string,
	options: CalendarTimeValidationOptions = {}
): CalendarTimeValidationResult {
	if (!value) {
		return { value: defaultValue, isValid: true };
	}

	const match = /^(\d{2}):([0-5]\d)(?::([0-5]\d))?$/.exec(value);
	if (!match) {
		return { value: defaultValue, isValid: false };
	}

	const hours = Number(match[1]);
	const minutes = Number(match[2]);
	const seconds = Number(match[3] ?? "00");
	const maxHour = options.maxHour ?? 23;

	if (hours < 0 || hours > maxHour) {
		return { value: defaultValue, isValid: false };
	}

	if (
		options.allowMaxHourOnlyAtZero &&
		hours === maxHour &&
		(minutes !== 0 || seconds !== 0)
	) {
		return { value: defaultValue, isValid: false };
	}

	return {
		value: `${match[1]}:${match[2]}:${match[3] ?? "00"}`,
		isValid: true,
	};
}

const CALENDAR_SNAP_MAX_MINUTES = 120;

function padTimeComponent(value: number): string {
	return String(value).padStart(2, "0");
}

/**
 * Parse the global drag/drop resolution setting.
 *
 * An empty value means "follow the time slot duration". A bare number is treated
 * as minutes so the smallest useful value can be entered as `1`; HH:mm(:ss)
 * values are accepted as well.
 */
export function normalizeCalendarSnapDuration(value: string): CalendarTimeValidationResult {
	const trimmed = value.trim();
	if (!trimmed) {
		return { value: "", isValid: true };
	}

	if (/^\d{1,3}$/.test(trimmed)) {
		const minutes = Number(trimmed);
		if (minutes < 1 || minutes > CALENDAR_SNAP_MAX_MINUTES) {
			return { value: "", isValid: false };
		}
		return {
			value: `${padTimeComponent(Math.floor(minutes / 60))}:${padTimeComponent(minutes % 60)}:00`,
			isValid: true,
		};
	}

	const normalized = normalizeCalendarTimeValue(trimmed, "");
	if (!normalized.isValid || normalized.value === "00:00:00") {
		return { value: "", isValid: false };
	}
	return normalized;
}

/**
 * Resolve the snapping interval that a calendar view should use. The global
 * setting wins over the view's slot duration; an empty setting keeps the old
 * behaviour of following the slot duration.
 */
export function resolveCalendarSnapDuration(
	snapDuration: string | undefined,
	slotDuration: string,
	fallback = "00:30:00"
): string {
	if (!snapDuration) {
		return normalizeCalendarTimeValue(slotDuration, fallback).value;
	}

	const normalized = normalizeCalendarSnapDuration(snapDuration);
	return normalized.isValid && normalized.value ? normalized.value : fallback;
}
