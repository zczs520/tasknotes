/* eslint-disable @typescript-eslint/no-non-null-assertion -- Project graph construction validates parent links before dereferencing. */
import { EventRef, TFile } from "obsidian";
import TaskNotesPlugin from "../main";
import { TaskInfo } from "../types";
import { parseLinkToPath } from "../utils/linkUtils";
import { createTaskNotesLogger } from "../utils/tasknotesLogger";

const tasknotesLogger = createTaskNotesLogger({ tag: "Services/ProjectSubtasksService" });

export class ProjectSubtasksService {
	private plugin: TaskNotesPlugin;
	private cacheEventRefs: EventRef[] = [];

	// Pre-computed reverse index: taskPath -> isUsedAsProject
	private projectIndex = new Map<string, boolean>();
	private projectSubtasksIndex = new Map<string, Set<string>>();
	private indexLastBuilt = 0;
	private readonly INDEX_TTL = 30000; // Rebuild index every 30 seconds

	// Performance stats (kept for monitoring)
	private stats = {
		indexBuilds: 0,
		indexHits: 0,
		indexMisses: 0,
	};

	constructor(plugin: TaskNotesPlugin) {
		this.plugin = plugin;
		this.registerCacheInvalidation();
	}

	private registerCacheInvalidation(): void {
		if (!this.plugin.cacheManager?.on) {
			return;
		}

		const invalidate = () => this.invalidateIndex();
		this.cacheEventRefs = [
			this.plugin.cacheManager.on("file-updated", invalidate),
			this.plugin.cacheManager.on("file-renamed", invalidate),
			this.plugin.cacheManager.on("file-deleted", invalidate),
		];
	}

	/**
	 * Get all files that link to a specific project using native resolvedLinks API
	 * resolvedLinks format: Record<sourcePath, Record<targetPath, linkCount>>
	 */
	private getFilesLinkingToProject(projectPath: string): string[] {
		const resolvedLinks = this.plugin.app.metadataCache.resolvedLinks;
		const linkingSources: string[] = [];

		// Iterate through all source files and their targets
		for (const [sourcePath, targets] of Object.entries(resolvedLinks)) {
			// Check if this source file links to our project
			if (targets && targets[projectPath] > 0) {
				linkingSources.push(sourcePath);
			}
		}

		return linkingSources;
	}

	/**
	 * Check for unresolved project references (broken links)
	 * Useful for debugging and maintenance
	 */
	private getUnresolvedProjectReferences(taskPath: string): string[] {
		const unresolvedLinks = this.plugin.app.metadataCache.unresolvedLinks;
		const taskUnresolvedLinks = unresolvedLinks[taskPath];

		if (!taskUnresolvedLinks) return [];

		// Filter for potential project references
		return Object.keys(taskUnresolvedLinks).filter((linkText) => {
			// Could be a project reference if it matches common patterns
			return !linkText.includes("#") && !linkText.includes("|");
		});
	}

	/**
	 * Get all tasks that reference this file as a project (uses native resolvedLinks API)
	 */
	async getTasksLinkedToProject(projectFile: TFile): Promise<TaskInfo[]> {
		try {
			const linkingSources = this.getFilesLinkingToProject(projectFile.path);
			const linkedTasks: TaskInfo[] = [];

			for (const sourcePath of linkingSources) {
				// Check if this source file is a task with project references
				const taskInfo = await this.plugin.cacheManager.getTaskInfo(sourcePath);
				if (
					taskInfo &&
					(await this.isLinkFromProjectsField(sourcePath, projectFile.path))
				) {
					linkedTasks.push(taskInfo);
				}
			}

			return linkedTasks;
		} catch (error) {
			tasknotesLogger.error("Error getting tasks linked to project:", {
				category: "persistence",
				operation: "getting-tasks-linked-project",
				error: error,
			});
			return [];
		}
	}

	/**
	 * Check if a task is used as a project (i.e., referenced by other tasks)
	 */
	async isTaskUsedAsProject(taskPath: string): Promise<boolean> {
		// Use sync method for consistency and performance
		return this.isTaskUsedAsProjectSync(taskPath);
	}

	/**
	 * Check if a link from source to target comes from the projects field
	 */
	private async isLinkFromProjectsField(
		sourceFilePath: string,
		targetFilePath: string
	): Promise<boolean> {
		try {
			const sourceFile = this.plugin.app.vault.getAbstractFileByPath(sourceFilePath);
			if (!(sourceFile instanceof TFile)) return false;

			const metadata = this.plugin.app.metadataCache.getFileCache(sourceFile);

			// Use the user's configured field mapping for projects
			const projectsFieldName = this.plugin.fieldMapper.toUserField("projects");
			if (!metadata?.frontmatter?.[projectsFieldName]) return false;

			const projects = metadata.frontmatter[projectsFieldName];
			if (!Array.isArray(projects)) return false;

			// Check if any project reference resolves to our target
			for (const project of projects) {
				if (!project || typeof project !== "string") continue;

				// Parse the link to extract the path (handles both wikilinks and markdown links)
				const linkPath = parseLinkToPath(project);

				// Skip if not a link format
				if (linkPath === project && !project.startsWith("[[")) {
					continue; // Plain text, not a link
				}

				// Resolve the link to get the actual file
				const resolvedFile = this.plugin.app.metadataCache.getFirstLinkpathDest(
					linkPath,
					sourceFilePath
				);

				if (resolvedFile && resolvedFile.path === targetFilePath) {
					return true;
				}
			}

			return false;
		} catch (error) {
			tasknotesLogger.error("Error checking if link is from projects field:", {
				category: "persistence",
				operation: "checking-if-link-projects-field",
				error: error,
			});
			return false;
		}
	}

	/**
	 * Get project status using pre-computed reverse index (much faster than scanning all files)
	 */
	isTaskUsedAsProjectSync(taskPath: string): boolean {
		this.ensureIndexBuilt();

		if (this.projectIndex.has(taskPath)) {
			this.stats.indexHits++;
			return this.projectIndex.get(taskPath)!;
		}

		this.stats.indexMisses++;
		return false; // Not in index = not a project
	}

	/**
	 * Return completion progress for task notes that reference the given task as a project.
	 * This uses the same relationship index as the Subtasks view, so Markdown checkboxes in
	 * the parent note do not affect the result.
	 */
	getSubtaskProgressSync(
		taskPath: string
	): { completed: number; total: number; percent: number } | null {
		this.ensureIndexBuilt();

		const subtaskPaths = this.projectSubtasksIndex.get(taskPath);
		if (!subtaskPaths || subtaskPaths.size === 0) {
			return null;
		}

		const statusFieldName = this.plugin.fieldMapper.toUserField("status");
		let total = 0;
		let completed = 0;

		for (const subtaskPath of subtaskPaths) {
			const metadata = this.plugin.app.metadataCache.getCache(subtaskPath);
			if (!metadata?.frontmatter) continue;
			if (!this.plugin.cacheManager.isTaskFile(metadata.frontmatter)) continue;

			total += 1;
			const storedStatus = metadata.frontmatter[statusFieldName];
			const status =
				typeof storedStatus === "string" && storedStatus.trim() !== ""
					? storedStatus
					: this.plugin.settings.defaultTaskStatus;
			if (this.plugin.statusManager.isCompletedStatus(status)) {
				completed += 1;
			}
		}

		if (total === 0) {
			return null;
		}

		return {
			completed,
			total,
			percent: Math.round((completed / total) * 100),
		};
	}

	/**
	 * Build reverse index of all project files (one scan instead of per-task scans)
	 */
	private buildProjectIndex(): void {
		this.projectIndex.clear();
		this.projectSubtasksIndex.clear();
		this.stats.indexBuilds++;

		try {
			const resolvedLinks = this.plugin.app.metadataCache.resolvedLinks;
			const projectPaths = new Set<string>();

			// Single pass through all resolved links to find project targets
			for (const [sourcePath, targets] of Object.entries(resolvedLinks)) {
				if (!targets) continue;

				// Check if source has projects frontmatter
				const metadata = this.plugin.app.metadataCache.getCache(sourcePath);

				// Validate that the source file is actually a task (issue #953)
				// Only tasks should be able to create project relationships
				if (!metadata?.frontmatter) continue;
				if (!this.plugin.cacheManager.isTaskFile(metadata.frontmatter)) continue;

				// Use the user's configured field mapping for projects
				const projectsFieldName = this.plugin.fieldMapper.toUserField("projects");
				const projects = metadata.frontmatter[projectsFieldName];

				if (!Array.isArray(projects)) continue;

				// Check if any project reference resolves to our target
				for (const project of projects) {
					if (!project || typeof project !== "string") continue;

					// Parse the link to extract the path (handles both wikilinks and markdown links)
					const linkPath = parseLinkToPath(project);

					// Skip if not a link format
					if (linkPath === project && !project.startsWith("[[")) {
						continue; // Plain text, not a link
					}

					// Resolve the link to get the actual file
					const resolvedFile = this.plugin.app.metadataCache.getFirstLinkpathDest(
						linkPath,
						sourcePath
					);

					if (resolvedFile) {
						projectPaths.add(resolvedFile.path);
						let subtaskPaths = this.projectSubtasksIndex.get(resolvedFile.path);
						if (!subtaskPaths) {
							subtaskPaths = new Set<string>();
							this.projectSubtasksIndex.set(resolvedFile.path, subtaskPaths);
						}
						subtaskPaths.add(sourcePath);
					}
				}
			}

			// Build the reverse index
			for (const projectPath of projectPaths) {
				this.projectIndex.set(projectPath, true);
			}

			this.indexLastBuilt = Date.now();
		} catch (error) {
			tasknotesLogger.error("Error building project index:", {
				category: "persistence",
				operation: "building-project-index",
				error: error,
			});
		}
	}

	/**
	 * Ensure index is fresh (rebuild if needed)
	 */
	private ensureIndexBuilt(): void {
		const now = Date.now();
		if (now - this.indexLastBuilt > this.INDEX_TTL) {
			this.buildProjectIndex();
		}
	}

	invalidateIndex(): void {
		this.projectIndex.clear();
		this.projectSubtasksIndex.clear();
		this.indexLastBuilt = 0;
	}

	/**
	 * Cleanup when service is destroyed
	 */
	destroy(): void {
		for (const ref of this.cacheEventRefs) {
			this.plugin.cacheManager.offref(ref);
		}
		this.cacheEventRefs = [];
		this.invalidateIndex();
		this.stats = {
			indexBuilds: 0,
			indexHits: 0,
			indexMisses: 0,
		};
	}

	/**
	 * Sort tasks by priority and status
	 */
	sortTasks(tasks: TaskInfo[]): TaskInfo[] {
		return tasks.sort((a, b) => {
			// First sort by completion status (incomplete first)
			const aCompleted = this.plugin.statusManager.isCompletedStatus(a.status);
			const bCompleted = this.plugin.statusManager.isCompletedStatus(b.status);

			if (aCompleted !== bCompleted) {
				return aCompleted ? 1 : -1;
			}

			// Then sort by priority
			const aPriorityWeight = this.plugin.priorityManager.getPriorityWeight(a.priority);
			const bPriorityWeight = this.plugin.priorityManager.getPriorityWeight(b.priority);

			if (aPriorityWeight !== bPriorityWeight) {
				return bPriorityWeight - aPriorityWeight; // Higher priority first
			}

			// Then sort by due date (earliest first)
			if (a.due && b.due) {
				return new Date(a.due).getTime() - new Date(b.due).getTime();
			} else if (a.due) {
				return -1; // Tasks with due dates come first
			} else if (b.due) {
				return 1;
			}

			// Finally sort by title
			return a.title.localeCompare(b.title);
		});
	}
}
