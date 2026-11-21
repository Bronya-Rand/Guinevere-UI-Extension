function isObject(value) {
	return value !== null && typeof value === "object" && !Array.isArray(value);
}

// Settings are copied on both reads and writes; callers never mutate saved data
// or their defaults accidentally. Accept only values that ST can save as JSON.
function copy(value, ancestors = new Set()) {
	if (value === null || typeof value === "string" || typeof value === "boolean") return value;
	if (typeof value === "number" && Number.isFinite(value)) return value;
	if (typeof value !== "object" || (!Array.isArray(value) && ![Object.prototype, null].includes(Object.getPrototypeOf(value)))) {
		throw new TypeError("Theme options must contain only JSON values.");
	}
	if (ancestors.has(value)) throw new TypeError("Theme options cannot contain circular references.");
	ancestors.add(value);
	const result = Array.isArray(value)
		? Array.from(value, item => copy(item, ancestors))
		: Object.fromEntries(Object.entries(value).map(([key, item]) => [key, copy(item, ancestors)]));
	ancestors.delete(value);
	return result;
}

function merge(defaults, saved) {
	const result = new Map(Object.entries(defaults));
	for (const [key, value] of Object.entries(saved)) {
		result.set(key, isObject(value) && isObject(result.get(key)) ? merge(result.get(key), value) : value);
	}
	return Object.fromEntries(result);
}

/** Saved options belong to a theme ID, independently of its active session. */
export function createThemeSettings(id, getSettings, saveSettings) {
	function store() {
		const settings = getSettings();
		if (!isObject(settings.themeSettings)) settings.themeSettings = {};
		return settings.themeSettings;
	}
	function read() {
		const values = store();
		return Object.hasOwn(values, id) && isObject(values[id]) ? copy(values[id]) : {};
	}
	return {
		get(defaults = {}) {
			if (!isObject(defaults)) throw new TypeError("Theme defaults must be an object.");
			return merge(copy(defaults), read());
		},
		set(patch) {
			if (!isObject(patch)) throw new TypeError("Theme options must be an object.");
			const values = merge(read(), copy(patch));
			Object.defineProperty(store(), id, { value: values, enumerable: true, writable: true, configurable: true });
			saveSettings();
			return copy(values);
		},
		reset() {
			delete store()[id];
			saveSettings();
		},
	};
}
