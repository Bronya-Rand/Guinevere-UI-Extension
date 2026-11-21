# Guinevere Theme Installer

This optional SillyTavern server plugin powers **Import Theme ZIP** and discovers theme folders for the dropdown. The normal Guinevere UI extension still works without it, using `themes/registry.json` and any existing saved theme selection.

## One-time setup

1. Install Guinevere for the current ST user using the standard extension installer. ZIP imports require a regular per-user installation, rather than a global-only installation or a symlink/junction.
2. Copy this `server-plugin` directory to `SillyTavern/plugins/guinevere-theme-installer/`. It must contain `index.mjs` and `theme-packs.mjs` directly inside that directory. This is a one-time plugin setup; individual themes can then be uploaded from Guinevere.
3. Set `enableServerPlugins: true` in ST's root `config.yaml`, and restart ST.
4. Open Guinevere settings and click **Refresh Themes**. **Import Theme ZIP** becomes available.

The plugin uses ST's existing `yauzl` dependency; no additional package installation is required in a normal ST installation. It uses ST's authenticated user context and existing request/CSRF middleware. It does not change ST's source or configuration automatically.

## Theme pack format

ZIP either the files directly, or one containing theme folder:

```text
my-theme.zip
  my-theme/
    manifest.json
    code.js
    style.css
    index.html
    assets/
      background.webp
```

Use the existing Guinevere theme manifest, preferably with a stable `id`:

```json
{
  "id": "my-theme",
  "name": "My Theme",
  "version": "1.0.0",
  "type": "full",
  "files": {
    "css": ["style.css"],
    "html": ["index.html"],
    "js": "code.js"
  }
}
```

Without `id`, the containing folder name or ZIP filename supplies a lowercase ID. Use lowercase letters, digits, hyphens, and underscores. All files named in the manifest must be present with matching case. Asset subfolders and relative imports remain supported because installation uses the usual `Guinevere-UI-Extension/themes/<id>` location.

Uploads are installed only into the authenticated user's extension folder. Existing themes, case-conflicting names, and bundled IDs are not overwritten. ZIPs are limited to 20 MiB compressed, 80 MiB expanded, 20 MiB per file, and 1000 entries. Encrypted archives, filesystem links, unsafe paths, and ambiguous pack layouts are rejected. Files are staged and published after validation; rejected imports do not leave a selectable partial theme.

Importing selects the installed theme without executing it. Click **Apply Theme** to activate it. Theme JavaScript runs with the same page access as other ST extensions, so import packs from authors you trust.
