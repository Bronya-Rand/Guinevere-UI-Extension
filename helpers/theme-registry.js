import { extensionFolderPath } from "../constants.js";
import { validateManifest } from "./theme-manifest.js";

export const installerUrl = "/api/plugins/guinevere-theme-installer";
export const maxThemeUploadBytes = 10 * 1024 * 1024;

export function isThemeId(value) {
	return (
		typeof value === "string" &&
		Boolean(value.trim()) &&
		!/[/\\?#:]/.test(value) &&
		![".", ".."].includes(value)
	);
}

/** Combine the bundled registry, server-discovered folders, and an old selection. */
export async function loadThemeRegistry(selected = "") {
	const [registry, installer] = await Promise.all([
		$.getJSON(`${extensionFolderPath}/themes/registry.json`),
		fetch(`${installerUrl}/themes`, { cache: "no-store" })
			.then(async (response) => {
				if (response.status === 404) return null;
				if (!response.ok)
					throw new Error("The theme installer could not list themes.");
				return response.json();
			})
			.catch((error) => ({ error: error.message })),
	]);
	if (
		!Array.isArray(registry.themes) ||
		registry.themes.some((id) => !isThemeId(id))
	) {
		throw new Error("The bundled theme registry is invalid.");
	}
	const ids = new Set(registry.themes);
	for (const entry of installer?.themes || [])
		if (isThemeId(entry.id)) ids.add(entry.id);
	if (isThemeId(selected)) ids.add(selected);
	const themes = await Promise.all(
		[...ids].map(async (id) => {
			try {
				const manifest = await $.getJSON(
					`${extensionFolderPath}/themes/${encodeURIComponent(id)}/manifest.json`,
				);
				validateManifest(manifest);
				return {
					id,
					name:
						typeof manifest.name === "string" && manifest.name.trim()
							? manifest.name
							: id,
					version: typeof manifest.version === "string" ? manifest.version : "",
					author: typeof manifest.author === "string" ? manifest.author : "",
				};
			} catch (error) {
				console.warn(`[Guinevere] Theme '${id}' is unavailable:`, error);
				return id === selected
					? { id, name: `${id} (unavailable)`, unavailable: true }
					: null;
			}
		}),
	);
	return {
		themes: themes.filter(Boolean).sort((a, b) => a.name.localeCompare(b.name)),
		installer,
	};
}

export async function uploadThemePack(file, getRequestHeaders) {
	if (!file || !/\.zip$/i.test(file.name))
		throw new Error("Choose a theme ZIP file.");
	if (!file.size || file.size > maxThemeUploadBytes)
		throw new Error("Theme ZIP files must be between 1 byte and 20 MiB.");
	const data = await new Promise((resolve, reject) => {
		const reader = new FileReader();
		reader.onload = () => resolve(String(reader.result).split(",")[1]);
		reader.onerror = () =>
			reject(new Error("Could not read the theme ZIP file."));
		reader.readAsDataURL(file);
	});
	const response = await fetch(`${installerUrl}/install`, {
		method: "POST",
		headers: getRequestHeaders(),
		body: JSON.stringify({ name: file.name, data }),
	});
	const result = await response.json().catch(() => ({}));
	if (!response.ok)
		throw new Error(
			result.error || `Theme import failed (${response.status}).`,
		);
	if (!isThemeId(result.id))
		throw new Error("The installer returned an invalid theme ID.");
	return result;
}
