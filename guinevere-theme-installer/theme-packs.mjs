import fs from "node:fs/promises";
import path from "node:path";

export const extensionName = "Guinevere-UI-Extension";
export const limits = Object.freeze({ compressed: 20 * 1024 * 1024, expanded: 80 * 1024 * 1024, file: 20 * 1024 * 1024, entries: 1000 });
const reservedIds = new Set(["google-messages", "google-messages-legacy", "template"]);
const installs = new Set();

export class ThemePackError extends Error {
	constructor(message, status = 400) { super(message); this.status = status; }
}

function archivePath(name) {
	if (typeof name !== "string" || name.length > 240 || /[\\:\x00-\x1f?#]/.test(name) || name.startsWith("/")) {
		throw new ThemePackError("Invalid archive path.");
	}
	const parts = name.replace(/\/$/, "").split("/");
	if (parts.some(part => !part || part === "." || part === ".." || /[. ]$/.test(part) || /^\.(git|svn|hg)$/i.test(part) || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(part))) {
		throw new ThemePackError("Invalid archive path.");
	}
	return parts.join("/");
}

/** Read entries sequentially, with limits on both declared and actual sizes. */
export function readThemeZip(buffer, yauzl) {
	if (!buffer.length || buffer.length > limits.compressed) throw new ThemePackError("Theme ZIP files must be between 1 byte and 20 MiB.");
	return new Promise((resolve, reject) => {
		yauzl.fromBuffer(buffer, { lazyEntries: true, strictFileNames: true, validateEntrySizes: true }, (error, zip) => {
			if (error) return reject(new ThemePackError("The file is not a readable ZIP archive."));
			const files = new Map(), names = new Set();
			let count = 0, total = 0, stopped = false, activeStream;
			const fail = error => {
				if (stopped) return;
				stopped = true;
				activeStream?.destroy();
				zip.close();
				reject(error instanceof ThemePackError ? error : new ThemePackError("The ZIP archive is damaged or unsupported."));
			};
			zip.on("error", fail);
			zip.on("end", () => { if (!stopped) { stopped = true; resolve(files); } });
			zip.on("entry", async entry => {
				if (stopped) return;
				try {
					if (++count > limits.entries) throw new ThemePackError("Theme ZIPs may contain at most 1000 entries.");
					const name = archivePath(entry.fileName);
					const mode = (entry.externalFileAttributes >>> 16) & 0xf000;
					if (mode === 0xa000 || (entry.externalFileAttributes & 0x400) || (entry.generalPurposeBitFlag & 1)) {
						throw new ThemePackError("Encrypted files and filesystem links are not supported in theme ZIPs.");
					}
					if (names.has(name.toLowerCase())) throw new ThemePackError("Theme ZIPs cannot contain duplicate or case-conflicting paths.");
					names.add(name.toLowerCase());
					if (entry.uncompressedSize > limits.file || (total += entry.uncompressedSize) > limits.expanded) {
						throw new ThemePackError("The expanded theme exceeds the 20 MiB per-file or 80 MiB total limit.");
					}
					if (!entry.fileName.endsWith("/") && !name.startsWith("__MACOSX/") && path.posix.basename(name) !== ".DS_Store") {
						const stream = activeStream = await new Promise((resolveStream, rejectStream) => zip.openReadStream(entry, (error, stream) => error ? rejectStream(error) : resolveStream(stream)));
						const chunks = [];
						let bytes = 0;
						for await (const chunk of stream) {
							bytes += chunk.length;
							if (bytes > entry.uncompressedSize || bytes > limits.file) throw new ThemePackError("A ZIP entry exceeds its declared size.");
							chunks.push(chunk);
						}
						files.set(name, Buffer.concat(chunks));
						activeStream = null;
					}
					if (!stopped) zip.readEntry();
				} catch (error) { fail(error); }
			});
			zip.readEntry();
		});
	});
}

export function validateThemePack(files, filename) {
	const candidates = [...files.keys()].filter(name => /^(?:[^/]+\/)?manifest\.json$/.test(name));
	if (candidates.length !== 1) throw new ThemePackError("Include one manifest.json at the ZIP root or inside one theme folder.");
	const manifestPath = candidates[0];
	const prefix = manifestPath.slice(0, -"manifest.json".length);
	if ([...files.keys()].some(name => !name.startsWith(prefix))) throw new ThemePackError("All theme files must be inside the manifest's theme folder.");
	const contents = new Map([...files].map(([name, data]) => [name.slice(prefix.length), data]));
	let manifest;
	try { manifest = JSON.parse(contents.get("manifest.json").toString("utf8").replace(/^\uFEFF/, "")); }
	catch { throw new ThemePackError("The theme manifest is not valid JSON."); }
	if (!manifest || typeof manifest !== "object" || Array.isArray(manifest) || !["css", "html", "full"].includes(manifest.type || "full")) {
		throw new ThemePackError("The theme manifest has an unsupported type.");
	}
	for (const key of ["name", "version", "author"]) {
		if (manifest[key] !== undefined && (typeof manifest[key] !== "string" || manifest[key].length > 200)) throw new ThemePackError("Theme metadata must use strings of at most 200 characters.");
	}
	for (const kind of ["css", "html"]) {
		if (manifest.files?.[kind] !== undefined && !Array.isArray(manifest.files[kind])) throw new ThemePackError("Manifest CSS and HTML files must be arrays.");
	}
	const declared = [...(manifest.files?.css || []), ...(manifest.files?.html || [])];
	if (manifest.files?.js !== undefined) declared.push(manifest.files.js);
	if (!declared.length) throw new ThemePackError("The theme manifest does not declare any files.");
	for (const file of declared) {
		if (archivePath(file) !== file || !contents.has(file)) throw new ThemePackError("A file declared in the theme manifest is missing or has an invalid path.");
	}
	if (manifest.injectMethod !== undefined && !["before", "after", "append", "prepend"].includes(manifest.injectMethod)) throw new ThemePackError("Unsupported theme injection method.");
	const fallback = prefix ? prefix.slice(0, -1) : String(filename).replace(/\.zip$/i, "");
	const id = manifest.id ?? fallback.toLowerCase().replace(/[^a-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80);
	if (typeof id !== "string" || !/^[a-z0-9][a-z0-9_-]{0,79}$/.test(id)) throw new ThemePackError("Theme IDs must use 1–80 lowercase letters, digits, hyphens, or underscores.");
	if (reservedIds.has(id)) throw new ThemePackError("That theme ID is reserved for a bundled theme.", 409);
	return { id, manifest, contents };
}

export function themeRoots(request, stRoot) {
	if (!request.user?.directories?.extensions) throw new ThemePackError("An authenticated SillyTavern user is required.", 403);
	return {
		local: path.resolve(request.user.directories.extensions, extensionName, "themes"),
		global: path.resolve(stRoot, "public/scripts/extensions/third-party", extensionName, "themes"),
	};
}

export async function canImportThemes(request) {
	try {
		const base = await fs.realpath(request.user.directories.extensions);
		const extension = path.join(base, extensionName);
		const directory = await fs.lstat(extension);
		const manifest = await fs.lstat(path.join(extension, "manifest.json"));
		if (!directory.isDirectory() || directory.isSymbolicLink() || !manifest.isFile() || manifest.isSymbolicLink()) return false;
		const themes = await fs.lstat(path.join(extension, "themes")).catch(error => { if (error.code === "ENOENT") return null; throw error; });
		return !themes || (themes.isDirectory() && !themes.isSymbolicLink());
	} catch { return false; }
}

export async function listThemes(request, stRoot) {
	const roots = themeRoots(request, stRoot);
	const themes = new Map();
	for (const root of [roots.global, roots.local]) {
		const entries = await fs.readdir(root, { withFileTypes: true }).catch(error => { if (error.code === "ENOENT") return []; throw error; });
		for (const entry of entries) {
			if (!entry.isDirectory() || entry.name.startsWith(".")) continue;
			try {
				const manifest = JSON.parse(await fs.readFile(path.join(root, entry.name, "manifest.json"), "utf8"));
				themes.set(entry.name, { id: entry.name, name: manifest.name || entry.name });
			} catch { /* Incomplete folders are not selectable themes. */ }
		}
	}
	const canImport = await canImportThemes(request);
	return { themes: [...themes.values()], canImport, reason: canImport ? "" : "ZIP import requires Guinevere installed for the current user, rather than only globally or through a filesystem link." };
}

export async function installTheme(request, stRoot, yauzl) {
	if (!(await canImportThemes(request))) throw new ThemePackError("Install Guinevere for the current user before importing theme ZIPs.", 409);
	const roots = themeRoots(request, stRoot);
	const extension = path.dirname(roots.local);
	if (installs.has(extension)) throw new ThemePackError("Another theme import is in progress. Try again shortly.", 409);
	installs.add(extension);
	let stage;
	try {
		const { name, data } = request.body || {};
		if (typeof name !== "string" || !/\.zip$/i.test(name) || typeof data !== "string" || !data || data.length > Math.ceil(limits.compressed / 3) * 4 || !/^[A-Za-z0-9+/]*={0,2}$/.test(data)) {
			throw new ThemePackError("Upload a theme ZIP of at most 20 MiB.");
		}
		const pack = validateThemePack(await readThemeZip(Buffer.from(data, "base64"), yauzl), name);
		for (const root of [roots.local, roots.global]) {
			const names = await fs.readdir(root).catch(error => { if (error.code === "ENOENT") return []; throw error; });
			if (names.some(name => name.toLowerCase() === pack.id.toLowerCase())) throw new ThemePackError("A theme with that ID already exists. Existing themes are not overwritten.", 409);
		}
		stage = await fs.mkdtemp(path.join(extension, ".guinevere-import-"));
		for (const [name, data] of pack.contents) {
			const target = path.resolve(stage, name);
			if (!target.startsWith(stage + path.sep)) throw new ThemePackError("Invalid theme file destination.");
			await fs.mkdir(path.dirname(target), { recursive: true });
			await fs.writeFile(target, data, { flag: "wx" });
		}
		await fs.mkdir(roots.local, { recursive: true });
		await fs.rename(stage, path.join(roots.local, pack.id));
		stage = null;
		return { id: pack.id, name: pack.manifest.name || pack.id };
	} finally {
		try {
			if (stage) {
				if (path.dirname(stage) !== extension || !path.basename(stage).startsWith(".guinevere-import-")) throw new Error("Invalid staging cleanup path.");
				await fs.rm(stage, { recursive: true, force: true });
			}
		} finally { installs.delete(extension); }
	}
}
