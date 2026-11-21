# About `manifest.json`
Starting from Guinevere 2.0, all themes will be required to record all their files and the type of theme under a JSON file.

Important fields to keep in mind are:
- ID (recommended for ZIP packs): A stable, unique identifier using lowercase letters, digits, hyphens, or underscores. It determines the installed folder and persistent option namespace. See the [ZIP pack format](../../server-plugin/README.md).
- Name: Basically the human friendly name of your theme.
- Version: Version of your theme.
- Type: This specifies the type of theme you are using. This can be either:

    1. "css" - A pure CSS theme.
    2. "html" - A HTML theme only OR a HTML/CSS theme OR HTML/JS
    3. "full" - A whole theme with JS/HTML/CSS. Can also be used for pure JS add-ins.

- Files: This keeps a record of what Guinevere should load to its memory cache for unloading your theme. This is important for cleanup reasons. This doesn't take away your responsibility to make sure your theme cleans up after itself for other themes or to base ST.

## Theme lifecycle

The current template receives a shared session as `execute(theme)`. See the [shared helper API](../../helpers/README.md) for tracked panel movement, listeners, appearance variables, and persistent options. Helper-owned changes are disposed automatically after the optional `disable(theme)` function. Existing zero-argument `execute()`/`disable()` functions remain compatible.

Resolve your HTML container inside `execute()`, rather than at module scope: JavaScript modules are cached between applications, while the theme HTML is recreated.

`disable()` is called **before** injected HTML or CSS is removed, including after a partially failed `execute()`. It must tolerate partial initialization and repeated calls, restore borrowed ST nodes to their original positions, and remove listeners/observers/timers owned by the theme. Preserve native widgets and their jQuery data by moving existing nodes rather than rebuilding them. Restore only the styles and classes your theme changed.

Allow load and execution errors to propagate so Guinevere can report failure and clean up. If `disable()` throws, Guinevere retains the HTML and CSS to avoid destroying borrowed ST controls. See `google-messages-legacy` for a working example.
