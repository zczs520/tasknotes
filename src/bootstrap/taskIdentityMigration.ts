import { isNode, parseDocument, visit } from "yaml";

/** Normalize the configured board/statistics filter even after Bases removes YAML comments. */
export function updateGeneratedTaskIdentity(commandId: string, content: string): string {
	if (commandId !== "open-kanban-view" && commandId !== "open-statistics") return content;
	const document = parseDocument(content);
	if (document.errors.length > 0) return content;
	const filters = document.get("filters", true);
	if (!isNode(filters)) return content;
	let changed = false;
	visit(filters, {
		Scalar(_key, node) {
			if (
				typeof node.value === "string" &&
				/^file\.hasTag\(\s*["']task["']\s*\)$/.test(node.value.trim())
			) {
				node.value = 'note["taskType"] == "task"';
				changed = true;
			}
		},
	});
	return changed ? document.toString({ lineWidth: 0 }) : content;
}
