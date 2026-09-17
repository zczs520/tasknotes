import { spawnSync } from "node:child_process";

const npmCliPath = process.env.npm_execpath;

if (!npmCliPath) {
	throw new Error("npm_execpath is unavailable; run this script through npm run lint.");
}

const tasks = [
	["run", "lint:ts"],
	["run", "lint:review-types"],
	["run", "lint:css"],
	["run", "lint:architecture"],
];

let failed = false;

for (const args of tasks) {
	const result = spawnSync(process.execPath, [npmCliPath, ...args], {
		stdio: "inherit",
	});

	if (result.status !== 0) {
		failed = true;
	}
}

process.exit(failed ? 1 : 0);
