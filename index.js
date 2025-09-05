import { extension_settings } from "../../../extensions.js";
import {
	extensionName,
	extensionFolderPath,
	defaultSettings,
} from "./constants.js";
import { saveSettingsDebounced } from "../../../../script.js";

const loadedThemeElements = {
	css: [],
	htmlElements: [],
	js: null,
};

async function loadSettings() {
	extension_settings[extensionName] = extension_settings[extensionName] || {};
	if (Object.keys(extension_settings[extensionName]).length === 0) {
		Object.assign(extension_settings[extensionName], defaultSettings);
	}

	$("#guinevere-enable").prop(
		"checked",
		extension_settings[extensionName].enabled,
	);
	$("#guinevere-theme-input").val(extension_settings[extensionName].theme);

	// If enabled on startup, apply the theme
	if (extension_settings[extensionName].enabled) {
		applyTheme(true);
	}
}

// Handles the enabling/disabling of Guinevere.
function onThemeBoxClick(event) {
	const value = Boolean($(event.target).prop("checked"));
	extension_settings[extensionName].enabled = value;
	saveSettingsDebounced();
	if (!value) {
		resetTheme();
	}
}

// Handles the input box for theme selection.
function onThemeTextChange() {
	const value = $("#guinevere-theme-input").val();
	extension_settings[extensionName].theme = value;
	saveSettingsDebounced();
	toastr.success("Saved selected theme successfully.");
}

// Handles the application of Guinevere themes.
async function onThemeApplyClick() {
	if (!extension_settings[extensionName].enabled) {
		toastr.error("Guinevere is not enabled.");
		return;
	}
	await applyTheme();
}

// Handles the removal of Guinevere themes.
function onThemeRemoveClick() {
	resetTheme();
	extension_settings[extensionName].enabled = false;
	$("#guinevere-enable").prop("checked", false);
	saveSettingsDebounced();
}

/**
 * Removes all active theme elements from the DOM.
 * @param {boolean} silent - Whether to suppress the success message.
 */
async function resetTheme(silent = false) {
	// Unload CSS
	for (const linkElement of loadedThemeElements.css) {
		linkElement.remove();
	}
	loadedThemeElements.css = [];

	// Unload HTML
	for (const htmlElement of loadedThemeElements.htmlElements) {
		htmlElement.remove();
	}
	loadedThemeElements.htmlElements = [];

	// Unload JS
	if (
		loadedThemeElements.js &&
		typeof loadedThemeElements.js.disable === "function"
	) {
		try {
			await loadedThemeElements.js.disable();
		} catch (error) {
			console.error("Error while disabling theme JS:", error);
			toastr.error(
				"There was an error while disabling the theme's JavaScript code. Refresh SillyTavern to ensure all theme code is removed and contact the theme developer to fix this error.",
			);
		}
	} else {
		console.log(
			`[${extensionName}] No JS to unload for theme "${extension_settings[extensionName].lastSuccessfulTheme}".`,
		);
	}
	loadedThemeElements.js = null;
	extension_settings[extensionName].lastSuccessfulTheme = null;
	saveSettingsDebounced();
	if (!silent) {
		toastr.success("Reset back to default SillyTavern theme.");
	}
}

/**
 * Applies a Guinevere theme to the page.
 * @param {boolean} silent - Whether to suppress the success message.
 */
async function applyTheme(silent) {
	// Ensure the last theme is cleaned up before applying a new one
	await resetTheme(true);

	const themeName = extension_settings[extensionName].theme;
	if (!themeName) {
		toastr.error("No theme specified.");
		return;
	}

	const themePath = `${extensionFolderPath}/themes/${themeName}`;
	const manifestPath = `${themePath}/manifest.json`;

	try {
		const manifest = await $.getJSON(manifestPath);
		const themeType = manifest.type || "full";

		switch (themeType) {
			case "css":
				await applyCssTheme(themePath, manifest);
				break;
			case "html":
				await applyHtmlTheme(themePath, manifest, themeName);
				break;
			case "full":
				await applyFullTheme(themePath, manifest, themeName);
				break;
			default:
				toastr.error(`Unknown theme type "${themeType}" in manifest.`);
				return;
		}

		extension_settings[extensionName].lastSuccessfulTheme = themeName;
		if (!silent) {
			toastr.success(
				`Applied '${manifest.name || themeName}' theme successfully.`,
			);
		}
	} catch (error) {
		console.error(`Failed to load/apply theme '${themeName}':`, error);
		toastr.error(
			`Failed to load/apply theme "${themeName}". Check the console for details.`,
		);
	}
}

/**
 * Applies a CSS file to the document.
 * @param {string} cssPath - The path to the CSS file.
 */
function applyCssFile(cssPath) {
	const link = document.createElement("link");
	link.rel = "stylesheet";
	link.type = "text/css";
	link.href = cssPath;
	document.head.appendChild(link);
	loadedThemeElements.css.push($(link));
}

/**
 * Applies a CSS theme based on the provided manifest.
 * @param {string} themePath - The base path of the theme.
 * @param {Object} manifest - The theme's manifest object.
 */
async function applyCssTheme(themePath, manifest) {
	if (manifest.files?.css) {
		for (const cssFile of manifest.files.css) {
			applyCssFile(`${themePath}/${cssFile}`);
		}
	}
}

/**
 * Applies an HTML theme based on the provided manifest.
 * @param {string} themePath - The base path of the theme.
 * @param {Object} manifest - The theme's manifest object.
 * @param {string} themeName - The name of the theme being applied.
 */
async function applyHtmlTheme(themePath, manifest, themeName) {
	// Apply CSS first (if any)
	await applyCssTheme(themePath, manifest);

	// Apply HTML
	if (manifest.files?.html) {
		for (const htmlFile of manifest.files.html) {
			const htmlContent = await $.get(`${themePath}/${htmlFile}`);

			// Parse the HTML contents
			const elements = $($.parseHTML(htmlContent.trim()));

			// Inject element before the main ST UI (#top-bar), unless specified otherwise
			const injectPoint = manifest.injectPoint || "#top-bar";
			const injectMethod = manifest.injectMethod || "before";

			for (const element of elements) {
				const el = $(element);

				switch (injectMethod) {
					case "after":
						$(injectPoint).after(el);
						break;
					case "prepend":
						$(injectPoint).prepend(el);
						break;
					case "append":
						$(injectPoint).append(el);
						break;
					default:
						$(injectPoint).before(el);
						break;
				}
				// Store reference for later removal
				loadedThemeElements.htmlElements.push(el);
			}
		}
	}

	// Apply JS (if any)
	if (manifest.files?.js) {
		const jsFile = `./themes/${themeName}/${manifest.files.js}`;
		try {
			const module = await import(`${jsFile}?t=${Date.now()}`); // Cache-busting
			loadedThemeElements.js = module;
			if (typeof module.execute === "function") {
				await module.execute();
			}
		} catch (error) {
			console.error(`Failed to load JS file '${jsFile}':`, error);
		}
	}
}

/** Applies a full theme (CSS, HTML, JS) based on the provided manifest.
 * @param {string} themePath - The base path of the theme.
 * @param {Object} manifest - The theme's manifest object.
 * @param {string} themeName - The name of the theme being applied.
 */
async function applyFullTheme(themePath, manifest, themeName) {
	try {
		// Apply CSS
		await applyCssTheme(themePath, manifest);

		// Apply HTML and JS
		await applyHtmlTheme(themePath, manifest, themeName);
	} catch (error) {
		console.error(`Error applying full theme "${themeName}":`, error);
		throw error; // Re-throw to be caught in applyTheme
	}
}

// This function is called when the extension is loaded
$(document).ready(async () => {
	const settingsHtml = await $.get(`${extensionFolderPath}/settings.html`);
	$("#extensions_settings").append(settingsHtml);

	await loadSettings();

	$("#guinevere-enable").on("click", onThemeBoxClick);
	$("#guinevere-apply").on("click", onThemeApplyClick);
	$("#guinevere-reset").on("click", onThemeRemoveClick);
	$("#guinevere-theme-text-button").on("click", onThemeTextChange);
});
