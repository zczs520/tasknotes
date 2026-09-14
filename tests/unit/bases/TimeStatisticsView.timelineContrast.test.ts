import fs from "fs";
import path from "path";

const repoRoot = path.resolve(__dirname, "../../..");

function readRepoFile(relativePath: string): string {
	return fs.readFileSync(path.join(repoRoot, relativePath), "utf-8");
}

describe("time statistics timeline label contrast", () => {
	it("keeps flipped compact labels visible on the timeline background", () => {
		const css = readRepoFile("styles/time-statistics.css");
		const flippedLabelRule = css.match(
			/\.tn-time-statistics__timeline-block\.is-compact\.is-flipped\s+\.tn-time-statistics__timeline-label\s*\{([^}]*)\}/
		)?.[1];

		expect(flippedLabelRule).toBeDefined();
		expect(flippedLabelRule).toContain("color: var(--tn-stats-color)");
		expect(flippedLabelRule).not.toContain("color: white");
	});
});
