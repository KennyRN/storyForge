export function debounce<Args extends unknown[]>(
	fn: (...args: Args) => void,
	delayMs: number,
): ((...args: Args) => void) & { cancel: () => void } {
	let timer: number | null = null;
	const debounced = (...args: Args) => {
		if (timer !== null) window.clearTimeout(timer);
		timer = window.setTimeout(() => {
			timer = null;
			fn(...args);
		}, delayMs);
	};
	debounced.cancel = () => {
		if (timer !== null) window.clearTimeout(timer);
		timer = null;
	};
	return debounced;
}
