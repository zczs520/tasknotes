import type { BasesToggleOption } from "obsidian";

const AVAILABLE_SWIM_LANES_KEY = "availableSwimLanes";
const SWIM_LANE_VISIBILITY_PREFIX = "swimLaneVisible_";
const OPT_IN_VISIBILITY_MIGRATION_KEY = "swimLaneVisibilityOptInV1";

export type KanbanSwimLaneVisibilityConfig = {
	get?: (key: string) => unknown;
	set?: (key: string, value: unknown) => void;
};

export function getSwimLaneVisibilityKey(swimLaneKey: string): string {
	const encoded = Array.from(swimLaneKey)
		.map((character) => character.codePointAt(0)?.toString(16) ?? "")
		.join("-");
	return `${SWIM_LANE_VISIBILITY_PREFIX}${encoded}`;
}

export function normalizeAvailableSwimLanes(value: unknown): string[] {
	if (typeof value !== "string") return [];

	try {
		const parsed = JSON.parse(value) as unknown;
		if (!Array.isArray(parsed)) return [];
		return Array.from(
			new Set(
				parsed.filter((item): item is string => typeof item === "string" && item !== "")
			)
		);
	} catch {
		return [];
	}
}

export function getAvailableSwimLanes(config: KanbanSwimLaneVisibilityConfig): string[] {
	return normalizeAvailableSwimLanes(config.get?.(AVAILABLE_SWIM_LANES_KEY));
}

export function syncAvailableSwimLanes(
	config: KanbanSwimLaneVisibilityConfig,
	swimLaneKeys: readonly string[]
): boolean {
	const next = Array.from(new Set(swimLaneKeys));
	const current = getAvailableSwimLanes(config);
	let changed = migrateExistingSwimLaneVisibility(config, current.length > 0 ? current : next);

	if (JSON.stringify(current) !== JSON.stringify(next)) {
		config.set?.(AVAILABLE_SWIM_LANES_KEY, JSON.stringify(next));
		changed = true;
	}

	return changed;
}

function migrateExistingSwimLaneVisibility(
	config: KanbanSwimLaneVisibilityConfig,
	existingSwimLaneKeys: readonly string[]
): boolean {
	if (config.get?.(OPT_IN_VISIBILITY_MIGRATION_KEY) === true) return false;

	for (const swimLaneKey of existingSwimLaneKeys) {
		const visibilityKey = getSwimLaneVisibilityKey(swimLaneKey);
		if (typeof config.get?.(visibilityKey) !== "boolean") {
			config.set?.(visibilityKey, true);
		}
	}

	config.set?.(OPT_IN_VISIBILITY_MIGRATION_KEY, true);
	return true;
}

export function isSwimLaneVisible(
	config: KanbanSwimLaneVisibilityConfig,
	swimLaneKey: string
): boolean {
	return config.get?.(getSwimLaneVisibilityKey(swimLaneKey)) !== false;
}

export function filterVisibleSwimLanes<T>(
	config: KanbanSwimLaneVisibilityConfig,
	swimLanes: ReadonlyMap<string, T>
): Map<string, T> {
	return new Map(
		Array.from(swimLanes.entries()).filter(([swimLaneKey]) =>
			isSwimLaneVisible(config, swimLaneKey)
		)
	);
}

export function buildSwimLaneVisibilityToggleOptions(
	config: KanbanSwimLaneVisibilityConfig
): BasesToggleOption[] {
	return getAvailableSwimLanes(config).map((swimLaneKey) => ({
		type: "toggle",
		key: getSwimLaneVisibilityKey(swimLaneKey),
		displayName: swimLaneKey,
		default: true,
	}));
}
