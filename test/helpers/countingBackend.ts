/**
 * A backend wrapper that counts the operations still in flight, so a test can wait for the real file work to finish
 * instead of waiting a fixed real time (a fixed 20 ms was long enough on a quiet machine and not under load: the check
 * then ran before a save or a session file had landed).
 */
export interface Counted<T extends object> {
	backend: T;
	/** Operations started and not yet finished. */
	pending(): number;
	/** Resolves once nothing has been in flight for several turns of the event loop (follow-on work starts within one). */
	settle(): Promise<void>;
}

export function counted<T extends object>(inner: T): Counted<T> {
	let pending = 0;
	const backend = new Proxy(inner, {
		get(target, prop) {
			const value = Reflect.get(target, prop, target);
			if (typeof value !== "function") return value;
			return (...args: unknown[]) => {
				const result = value.apply(target, args);
				if (result && typeof (result as Promise<unknown>).then === "function") {
					pending++;
					const done = (): void => void pending--;
					(result as Promise<unknown>).then(done, done);
				}
				return result;
			};
		},
	});
	const settle = async (): Promise<void> => {
		const give = Date.now() + 20_000; // a stuck operation fails the test rather than hanging it
		let calm = 0;
		while (calm < 4) {
			await new Promise<void>((r) => setImmediate(r));
			calm = pending === 0 ? calm + 1 : 0;
			if (Date.now() > give) throw new Error(`file work still in flight after 20 s (${pending} operations)`);
		}
	};
	return { backend, pending: () => pending, settle };
}
