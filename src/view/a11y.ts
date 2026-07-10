/** Makes `el` keyboard-activatable like a native button: focusable via Tab, Enter/Space triggers `onActivate`. */
export function makeAccessibleActivatable(el: HTMLElement, onActivate: () => void): void {
	el.tabIndex = 0;
	el.setAttribute("role", "button");
	el.addEventListener("keydown", (e) => {
		if (e.key === "Enter" || e.key === " ") {
			e.preventDefault();
			onActivate();
		}
	});
}
