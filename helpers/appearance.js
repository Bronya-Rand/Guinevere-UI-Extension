// Keep the CSS defaults in style.css aligned with this public token mapping.
const colors = Object.freeze({
	text: ["--guinevere-text", "--SmartThemeBodyColor"],
	muted: ["--guinevere-muted", "--SmartThemeEmColor"],
	surface: ["--guinevere-surface", "--SmartThemeBlurTintColor"],
	chatSurface: ["--guinevere-chat-surface", "--SmartThemeChatTintColor"],
	userSurface: ["--guinevere-user-surface", "--SmartThemeUserMesBlurTintColor"],
	characterSurface: [
		"--guinevere-character-surface",
		"--SmartThemeBotMesBlurTintColor",
	],
	border: ["--guinevere-border", "--SmartThemeBorderColor"],
	accent: ["--guinevere-accent", "--SmartThemeQuoteColor"],
	shadow: ["--guinevere-shadow", "--SmartThemeShadowColor"],
});

export function createAppearance(session) {
	function read(index) {
		const style = getComputedStyle(document.body);
		return Object.fromEntries(
			Object.entries(colors).map(([name, properties]) => [
				name,
				style.getPropertyValue(properties[index]).trim(),
			]),
		);
	}

	return {
		getSTColors: () => read(1),
		getColors: () => read(0),
		override(values) {
			for (const [name, value] of Object.entries(values)) {
				if (
					!Object.hasOwn(colors, name) ||
					(value !== null && typeof value !== "string")
				) {
					throw new TypeError(`Invalid appearance override: ${name}`);
				}
			}
			for (const [name, value] of Object.entries(values)) {
				session.setStyle(document.body, colors[name][0], value);
			}
		},
	};
}
