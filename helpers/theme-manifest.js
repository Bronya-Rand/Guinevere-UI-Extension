export function validateManifest(manifest) {
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
