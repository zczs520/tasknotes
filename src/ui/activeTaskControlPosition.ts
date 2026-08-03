export interface ActiveTaskControlPosition {
	x: number;
	y: number;
}

export interface ActiveTaskControlSize {
	width: number;
	height: number;
}

export function clampActiveTaskControlPosition(
	position: ActiveTaskControlPosition,
	container: ActiveTaskControlSize,
	control: ActiveTaskControlSize,
	margin = 8
): ActiveTaskControlPosition {
	const maxX = Math.max(margin, container.width - control.width - margin);
	const maxY = Math.max(margin, container.height - control.height - margin);
	return {
		x: Math.min(maxX, Math.max(margin, Math.round(position.x))),
		y: Math.min(maxY, Math.max(margin, Math.round(position.y))),
	};
}
