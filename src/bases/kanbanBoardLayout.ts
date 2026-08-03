export const DEFAULT_KANBAN_BOARD_WIDTH = 1200;
export const DEFAULT_KANBAN_BOARD_SIDE_MARGIN = 0;

export interface KanbanBoardLayout {
	fullWidth: boolean;
	width: number;
	sideMargin: number;
}

function normalizeNumber(value: unknown, fallback: number, min: number, max: number): number {
	const numeric = typeof value === "number" ? value : Number(value);
	if (!Number.isFinite(numeric)) return fallback;
	return Math.min(max, Math.max(min, Math.round(numeric)));
}

export function normalizeKanbanBoardLayout(
	fullWidth: unknown,
	width: unknown,
	sideMargin: unknown
): KanbanBoardLayout {
	return {
		fullWidth: fullWidth === true,
		width: normalizeNumber(width, DEFAULT_KANBAN_BOARD_WIDTH, 600, 2400),
		sideMargin: normalizeNumber(sideMargin, DEFAULT_KANBAN_BOARD_SIDE_MARGIN, 0, 200),
	};
}

export function applyKanbanBoardLayout(element: HTMLElement, layout: KanbanBoardLayout): void {
	element.style.width = `calc(100% - ${layout.sideMargin * 2}px)`;
	element.style.maxWidth = layout.fullWidth ? "none" : `${layout.width}px`;
	element.addClass("tn-kanban-layout-frame");
}
