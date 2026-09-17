export type BasesTimeoutScheduler = {
	setTimeout: (callback: () => void, delayMs: number) => number;
	clearTimeout: (timer: number) => void;
};

type BasesConfigRefreshController = {
	onConfigChanged?: (...args: unknown[]) => unknown;
	view?: unknown;
};

type InstallBasesConfigRefreshHookOptions = {
	controller: unknown;
	view: unknown;
	isConnected: () => boolean;
	refresh: () => void;
	shouldRefresh?: () => boolean;
	scheduleTimeout: (callback: () => void, delayMs: number) => void;
};

type ScheduleBasesDataUpdateRenderOptions = {
	currentTimer: number | null;
	scheduler: BasesTimeoutScheduler;
	isConnected: () => boolean;
	beforeRender: () => void;
	render: () => void | Promise<void>;
	onTimerCleared: () => void;
	onRenderError: (error: unknown) => void;
	delayMs?: number;
};

type ScheduleBasesDebouncedRefreshOptions = {
	currentTimer: number | null;
	scheduler: BasesTimeoutScheduler;
	render: () => void | Promise<void>;
	onTimerCleared: () => void;
	delayMs?: number;
};

function isRecord(value: unknown): value is Record<string, unknown> {
	return value !== null && typeof value === "object" && !Array.isArray(value);
}

function scheduleConfigRefreshAfterResult(
	result: unknown,
	refresh: (() => void) | null,
	scheduleTimeout: (callback: () => void, delayMs: number) => void
): void {
	const maybePromise = result as PromiseLike<unknown> | null;
	if (maybePromise && typeof maybePromise.then === "function") {
		// Keep observing native save failures even when no additional render is needed.
		const complete = refresh ?? (() => undefined);
		void maybePromise.then(complete, complete);
		return;
	}

	if (refresh) scheduleTimeout(refresh, 0);
}

export function installBasesConfigRefreshHook({
	controller,
	view,
	isConnected,
	refresh,
	shouldRefresh,
	scheduleTimeout,
}: InstallBasesConfigRefreshHookOptions): (() => void) | null {
	if (!isRecord(controller) || typeof controller.onConfigChanged !== "function") {
		return null;
	}

	const basesController = controller as BasesConfigRefreshController;
	const originalOnConfigChanged = basesController.onConfigChanged;
	if (!originalOnConfigChanged) {
		return null;
	}

	const refreshIfCurrentView = () => {
		if (basesController.view && basesController.view !== view) {
			return;
		}
		if (!isConnected()) {
			return;
		}
		refresh();
	};

	const wrappedOnConfigChanged = (...args: unknown[]): unknown => {
		// Decide before invoking the native save: it may complete asynchronously after
		// the view's presentation-only write scope has ended.
		const refreshRequired = shouldRefresh?.() ?? true;
		const result = originalOnConfigChanged.apply(basesController, args);
		scheduleConfigRefreshAfterResult(
			result,
			refreshRequired ? refreshIfCurrentView : null,
			scheduleTimeout
		);
		return result;
	};

	basesController.onConfigChanged = wrappedOnConfigChanged;
	return () => {
		if (basesController.onConfigChanged === wrappedOnConfigChanged) {
			basesController.onConfigChanged = originalOnConfigChanged;
		}
	};
}

export function scheduleBasesDataUpdateRender({
	currentTimer,
	scheduler,
	isConnected,
	beforeRender,
	render,
	onTimerCleared,
	onRenderError,
	delayMs = 500,
}: ScheduleBasesDataUpdateRenderOptions): number | null {
	if (!isConnected()) {
		return currentTimer;
	}

	if (currentTimer) {
		scheduler.clearTimeout(currentTimer);
	}

	return scheduler.setTimeout(() => {
		onTimerCleared();
		try {
			beforeRender();
			void render();
		} catch (error) {
			onRenderError(error);
		}
	}, delayMs);
}

export function scheduleBasesDebouncedRefresh({
	currentTimer,
	scheduler,
	render,
	onTimerCleared,
	delayMs = 300,
}: ScheduleBasesDebouncedRefreshOptions): number {
	if (currentTimer) {
		scheduler.clearTimeout(currentTimer);
	}

	return scheduler.setTimeout(() => {
		try {
			void render();
		} finally {
			onTimerCleared();
		}
	}, delayMs);
}
