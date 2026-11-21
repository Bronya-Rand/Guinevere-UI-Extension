import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { ThemePackError, listThemes, installTheme } from "./theme-packs.mjs";

export const info = {
	id: "guinevere-theme-installer",
	name: "Guinevere Theme Installer",
	description: "Lists and installs Guinevere theme ZIPs for the authenticated SillyTavern user.",
};

export function registerRoutes(router, { stRoot = fileURLToPath(new URL("../../", import.meta.url)), yauzl } = {}) {
	const handle = action => async (request, response) => {
		try { response.json(await action(request)); }
		catch (error) {
			if (!(error instanceof ThemePackError)) console.error("[Guinevere Theme Installer]", error);
			response.status(error instanceof ThemePackError ? error.status : 500).json({ error: error instanceof ThemePackError ? error.message : "Theme installation failed. Check the SillyTavern server log." });
		}
	};
	router.get("/themes", handle(request => listThemes(request, stRoot)));
	router.post("/install", handle(request => installTheme(request, stRoot, yauzl)));
}

export async function init(router) {
	// ST already depends on yauzl; resolve its installed copy from the plugin.
	registerRoutes(router, { yauzl: createRequire(import.meta.url)("yauzl") });
}
