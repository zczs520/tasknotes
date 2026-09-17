/** A shared, session-stable identity palette; tag and goal identities never share a slot. */
const PALETTE = [
	"#e2643c",
	"#4f8a63",
	"#7a6bb5",
	"#4d7fa6",
	"#c58a29",
	"#c9493f",
	"#398c87",
	"#b96383",
	"#8c8543",
	"#9369a4",
	"#467c91",
	"#ab714a",
] as const;
const assigned = new Map<string, string>();
const used = new Set<string>();

export function getStatisticsColor(kind: "tag" | "goal", value: string | null): string {
	if (kind === "tag" && value === null) return "#7b8794";
	const identity = kind === "tag" ? value?.trim().replace(/^#+/u, "") : value?.trim();
	const key = `${kind}:${identity ?? ""}`;
	const existing = assigned.get(key);
	if (existing) return existing;
	let hash = 2166136261;
	for (let index = 0; index < key.length; index++) {
		hash = Math.imul(hash ^ key.charCodeAt(index), 16777619) >>> 0;
	}
	// Seed the random-looking palette choice from the identity, then probe unused slots.
	for (let offset = 0; offset < PALETTE.length; offset++) {
		const color = PALETTE[(hash + offset * 5) % PALETTE.length];
		if (!used.has(color)) {
			assigned.set(key, color);
			used.add(color);
			return color;
		}
	}
	// Do not repeat the finite palette when a vault has many tags/goals.
	let hue = (hash % 36000) / 100;
	let color = `hsl(${hue} 42% 46%)`;
	while (used.has(color)) {
		hue = Number(((hue + 137.51) % 360).toFixed(2));
		color = `hsl(${hue} 42% 46%)`;
	}
	assigned.set(key, color);
	used.add(color);
	return color;
}

export function applyStatisticsTagColor(element: HTMLElement, tag: string | null): void {
	element.style.setProperty("--tn-stats-color", getStatisticsColor("tag", tag));
}
