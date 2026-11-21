import {
	event_types,
	eventSource,
	saveSettingsDebounced,
} from "../../../../script.js";
import { extension_settings, getContext } from "../../../extensions.js";
import {
	defaultSettings,
	extensionFolderPath,
	extensionName,
} from "./constants.js";
import { createThemeSession } from "./helpers/theme-session.js";
import { loadThemeRegistry, uploadThemePack } from "./helpers/theme-registry.js";
import { getRequestHeaders } from "../../../../script.js";

const loadedThemeElements = {
	css: [],
	htmlElements: [],
	js: null,
	session: null,
};
let themeOperation = Promise.resolve();

// Serialize all DOM changes, including resets requested while a theme is loading.
function queueThemeOperation(operation) {
	const result = themeOperation.then(operation);
	themeOperation = result.catch(() => {});
	return result;
}

// IDs are distinct now; old saved selections are migrated once in loadSettings().
function resolveThemeName(name) {
	const value = String(name ?? "").trim();
	return value;
}

function loadSettings() {
	const settings = (extension_settings[extensionName] = {
		...defaultSettings,
		...extension_settings[extensionName],
	});

	if (settings.settingsVersion < 1) {
		const migrated = settings.theme === "google-messages";
		if (migrated) settings.theme = "google-messages-legacy";
		if (settings.lastSuccessfulTheme === "google-messages") settings.lastSuccessfulTheme = "google-messages-legacy";
		settings.theme = resolveThemeName(settings.theme);
		settings.lastSuccessfulTheme = resolveThemeName(
			settings.lastSuccessfulTheme,
		);
		settings.settingsVersion = 1;
		saveSettingsDebounced();
		if (migrated) {
			toastr.info(
				"Your Google Messages theme is now named Google Messages (Legacy). Your selection was migrated automatically.",
			);
		}
	}

	$("#guinevere-enable").prop("checked", settings.enabled);
}

function onThemeBoxClick(event) {
	const enabled = Boolean($(event.target).prop("checked"));
	extension_settings[extensionName].enabled = enabled;
	saveSettingsDebounced();
	if (!enabled) void resetTheme();
}

function onThemeTextChange() {
	const value = resolveThemeName($("#guinevere-theme-select").val());
	extension_settings[extensionName].theme = value;
	saveSettingsDebounced();
}

async function refreshThemes() {
	try {
		const selected = extension_settings[extensionName].theme;
		const catalog = await loadThemeRegistry(selected);
		const select = document.getElementById("guinevere-theme-select");
		select.replaceChildren(new Option("Select a theme", ""));
		for (const theme of catalog.themes) select.add(new Option(theme.name, theme.id));
		select.value = extension_settings[extensionName].theme;
		$("#guinevere-import-theme").prop("disabled", !catalog.installer?.canImport);
		$("#guinevere-import-status").text(catalog.installer?.canImport ? "Import a theme ZIP, then Apply Theme." : catalog.installer?.reason || "ZIP import needs the optional companion installer.");
	} catch (error) { toastr.error(error.message, undefined, { escapeHtml: true }); }
}

async function importTheme(event) {
	const input = event.target;
	if (!input.files?.[0]) return;
	$("#guinevere-import-theme").prop("disabled", true);
	try {
		const result = await uploadThemePack(input.files[0], getRequestHeaders);
		extension_settings[extensionName].theme = result.id;
		saveSettingsDebounced();
		toastr.success("Theme imported. Click Apply Theme to activate it.");
	} catch (error) { toastr.error(error.message, undefined, { escapeHtml: true }); }
	finally { input.value = ""; await refreshThemes(); }
}

function onThemeApplyClick() {
	if (!extension_settings[extensionName].enabled) {
		toastr.error("Guinevere is not enabled.");
		return;
	}
	void applyTheme();
}

function onThemeRemoveClick() {
	extension_settings[extensionName].enabled = false;
	$("#guinevere-enable").prop("checked", false);
	saveSettingsDebounced();
	void resetTheme();
}

async function unloadTheme() {
	// Restore borrowed ST nodes before jQuery removes their host. If restoration
	// fails, retain the host and references so reset can be retried.
	if (typeof loadedThemeElements.js?.disable === "function") {
		await loadedThemeElements.js.disable(loadedThemeElements.session);
	}
	await loadedThemeElements.session?.dispose();
	loadedThemeElements.js = null;
	loadedThemeElements.session = null;
	for (const element of loadedThemeElements.htmlElements) element.remove();
	loadedThemeElements.htmlElements = [];
	for (const element of loadedThemeElements.css) element.remove();
	loadedThemeElements.css = [];
	extension_settings[extensionName].lastSuccessfulTheme = "";
	saveSettingsDebounced();
}

function reportResetError(error) {
	console.error(`[${extensionName}] Failed to reset theme:`, error);
	toastr.error(
		"The theme could not restore SillyTavern. Refresh the page before applying another theme. Check the console for details.",
	);
}

function resetTheme(silent = false) {
	return queueThemeOperation(async () => {
		try {
			await unloadTheme();
			if (!silent) toastr.success("Reset back to the original SillyTavern UI.");
		} catch (error) {
			reportResetError(error);
		}
	});
}

function validateManifest(manifest) {
	if (!manifest || typeof manifest !== "object" || Array.isArray(manifest)) {
		throw new Error("Invalid theme manifest.");
	}
	if (!["css", "html", "full"].includes(manifest.type || "full")) {
		throw new Error(`Unknown theme type "${manifest.type}".`);
	}

	for (const type of ["css", "html"]) {
		if (
			manifest.files?.[type] !== undefined &&
			!Array.isArray(manifest.files[type])
		) {
			throw new Error(`manifest.files.${type} must be an array.`);
		}
	}
	const files = [
		...(manifest.files?.css || []),
		...(manifest.files?.html || []),
	];
	if (manifest.files?.js !== undefined) files.push(manifest.files.js);
	for (const file of files) {
		if (
			typeof file !== "string" ||
			!file.trim() ||
			/[\\?#:]/.test(file) ||
			file.startsWith("/") ||
			file.split("/").includes("..")
		) {
			throw new Error(
				"Theme files must use relative file paths within the theme folder.",
			);
		}
	}
}

function applyTheme(silent = false) {
	const themeName = resolveThemeName(extension_settings[extensionName].theme);

	return queueThemeOperation(async () => {
		if (!extension_settings[extensionName].enabled) return;

		let applying = false;
		try {
			if (
				!themeName ||
				/[/\\?#:]/.test(themeName) ||
				[".", ".."].includes(themeName)
			) {
				throw new Error("Specify a theme folder name.");
			}

			const themePath = `${extensionFolderPath}/themes/${themeName}`;
			const manifest = await $.getJSON(`${themePath}/manifest.json`);

			// Validate the selection before removing a working theme.
			validateManifest(manifest);

			await unloadTheme();
			applying = true;
			loadedThemeElements.session = createThemeSession({
				id: themeName,
				getSettings: () => extension_settings[extensionName],
				saveSettings: saveSettingsDebounced,
				getContext,
			});
			await applyCssTheme(themePath, manifest);
			if (manifest.type !== "css")
				await applyHtmlTheme(themePath, manifest, themeName);
			extension_settings[extensionName].lastSuccessfulTheme = themeName;
			saveSettingsDebounced();
			if (!silent && extension_settings[extensionName].enabled) {
				toastr.success(
					`Applied '${manifest.name || themeName}' theme successfully.`,
				);
			}
		} catch (error) {
			console.error(
				`[${extensionName}] Failed to load/apply '${themeName}':`,
				error,
			);
			if (applying) {
				try {
					await unloadTheme();
				} catch (resetError) {
					reportResetError(resetError);
				}
			}
			toastr.error(
				`Failed to load/apply theme "${themeName}". Check the console for details.`,
			);
		}
	});
}

function applyCssFile(cssPath) {
	return new Promise((resolve, reject) => {
		const link = document.createElement("link");
		link.rel = "stylesheet";
		link.href = cssPath;
		const finish = (error) => {
			clearTimeout(timeout);
			link.onload = link.onerror = null;
			if (error) reject(error);
			else resolve();
		};
		const timeout = setTimeout(
			() => finish(new Error(`Timed out loading CSS: ${cssPath}`)),
			15000,
		);
		link.onload = () => finish();
		link.onerror = () => finish(new Error(`Failed to load CSS: ${cssPath}`));
		loadedThemeElements.css.push($(link));
		document.head.appendChild(link);
	});
}

async function applyCssTheme(themePath, manifest) {
	for (const file of manifest.files?.css || []) {
		await applyCssFile(
			`${themePath}/${file}?v=${encodeURIComponent(manifest.version || "1")}`,
		);
	}
}

async function applyHtmlTheme(themePath, manifest, themeName) {
	for (const file of manifest.files?.html || []) {
		const content = await $.get(`${themePath}/${file}`);
		const target = $(manifest.injectPoint || "#top-bar");
		const method = manifest.injectMethod || "before";
		if (target.length !== 1)
			throw new Error("Theme injection point must match exactly one element.");
		if (!["before", "after", "prepend", "append"].includes(method)) {
			throw new Error(`Unknown theme injection method "${method}".`);
		}
		const elements = $($.parseHTML(content.trim()));
		loadedThemeElements.htmlElements.push(elements);
		target[method](elements);
	}
	if (manifest.files?.js) {
		const url = new URL(
			`./themes/${themeName}/${manifest.files.js}`,
			import.meta.url,
		);
		url.searchParams.set("v", manifest.version || "1");
		const module = await import(url.href);
		loadedThemeElements.js = module;
		if (typeof module.execute === "function")
			await module.execute(loadedThemeElements.session);
	}
}

$(document).ready(async () => {
	try {
		const settingsHtml = await $.get(`${extensionFolderPath}/settings.html`);
		$("#extensions_settings").append(settingsHtml);
		loadSettings();
		$("#guinevere-enable").on("click", onThemeBoxClick);
		$("#guinevere-apply").on("click", onThemeApplyClick);
		$("#guinevere-reset").on("click", onThemeRemoveClick);
		$("#guinevere-theme-select").on("change", onThemeTextChange);
		$("#guinevere-refresh-themes").on("click", refreshThemes);
		$("#guinevere-import-theme").on("click", () => $("#guinevere-theme-upload").trigger("click"));
		$("#guinevere-theme-upload").on("change", importTheme);
		await refreshThemes();

		eventSource.on(event_types.APP_READY, () => {
			if (extension_settings[extensionName].enabled) return applyTheme(true);
		});
	} catch (error) {
		console.error(`[${extensionName}] Failed to initialize:`, error);
		toastr.error(
			"Guinevere could not initialize. Check the console for details.",
		);
	}
});
