# Shared theme helpers

Guinevere passes a fresh session to `execute(theme)` on every application. Keep activation state inside that function: imported JavaScript modules can be cached. Existing themes with `execute()` and `disable()` continue to work; using helpers is optional.

```js
export function execute(theme) {
    const root = theme.element("#my-theme");
    const options = theme.settings.get({ sidebarWidth: 300 });
    theme.setStyle(root, "--sidebar-width", `${options.sidebarWidth}px`);
    theme.on("#sidebar-width", "change", event => {
        const width = Number(event.target.value);
        theme.settings.set({ sidebarWidth: width });
        theme.setStyle(root, "--sidebar-width", `${width}px`);
    });
    theme.onST("personaChanged", () => {
        const persona = theme.st.getPersona();
        // Update your theme's profile markup here.
    });
}
```

## Lifecycle and resources

The loader calls an optional `disable(theme)` first, then disposes the session, then removes injected HTML and CSS. It also disposes a partially initialized session after an application error. A theme using only tracked helpers needs no `disable()` function.

| Method | Behavior |
|---|---|
| `element(target)` | Resolve exactly one element from a CSS selector, DOM element, or one-element jQuery collection. Throws when missing or ambiguous. |
| `on(target, events, handler)` | Register jQuery events on one or more targets with a session-specific namespace. Returns an asynchronous stop function. |
| `onST(event, handler, { optional: false })` | Register an ST event and remove it on disposal. Returns a stop function. Unknown events throw unless optional. |
| `observe(target, options, callback)` | Create a tracked MutationObserver; returns the observer. |
| `timeout(callback, delay)` / `interval(callback, delay)` | Track a timer; return its native ID. |
| `addCleanup(callback)` | Register custom synchronous or asynchronous cleanup; returns an asynchronous stop function. |
| `signal` | AbortSignal aborted when disposal begins. Pass it to your own abortable requests. |
| `active` / `disposed` | Whether changes are still accepted / cleanup has completed successfully. |

ST events accept enum keys such as `PERSONA_CHANGED`, raw values present in ST's event enum, and these aliases: `settingsUpdated`, `personaChanged`, `personaUpdated`, `chatChanged`, `userMessageRendered`, `characterMessageRendered`, `generationStarted`, `generationEnded`, `generationStopped`, and `onlineStatusChanged`.

Cleanup runs in reverse registration order within three phases: stop resources, restore borrowed nodes and changed properties, remove owned elements. The separate phases protect borrowed ST nodes even when their temporary container was registered later. Successful cleanup tasks run once. Failed tasks remain available for retry, and owned elements are retained if an earlier cleanup failed. The loader retains its HTML/CSS references until cleanup succeeds. A closing session rejects further DOM mutations and resource registrations.

These guarantees apply to changes made through the helpers. Register cleanup for other resources you create; the session cannot undo arbitrary JavaScript or reconstruct an element you deleted manually.

## Elements and reversible changes

| Method | Behavior |
|---|---|
| `move(element, destination)` | Append a real element to a destination and mark its original position with a placeholder. Repeated moves retain its first original position. |
| `movePanel(panel, destination)` | The same operation, with support for the semantic ST panel names below. |
| `ownElement(element)` | Register a newly created element for removal after borrowed nodes are restored. Returns the DOM element. Use this for your own elements. |
| `setStyle(element, property, value, priority = "")` | Remember and change one inline property. `null` removes it. Restores its original value and priority. |
| `setClass(element, name, enabled = true)` | Remember and change one class membership. |
| `setAttribute(element, name, value)` | Remember and change one attribute. `null` removes it. |

Targets can be selectors, elements, or jQuery collections as accepted by `element()`. Repeated property changes remember the value before the first change. Unrelated properties/classes are preserved. Widgets and jQuery data survive normal DOM moves. A node cannot be borrowed simultaneously by two sessions.

`theme.st.getPanel(name)` resolves these names: `responseSettings`, `connectionSettings`, `advancedFormatting`, `worldInfo`, `userSettings`, `backgrounds`, `extensions`, `personas`, and `characters`. A specific selector or element is also accepted. `theme.st.listPanels()` returns the main top-bar panels as `{ key, element, toggle, label }` records, including unrecognized panels added by other extensions. Theme authors retain control of the navigation markup and icons.

```js
const workspace = theme.createPanelWorkspace({
    target: "#settings-content",
    selectedClass: "is-selected",
    onSelect(selected, entries) { /* Optional theme-specific icon updates. */ },
});
workspace.add({ panel: "worldInfo", button: "#world-info-button" });
workspace.add({ panel: "personas", button: "#personas-button", display: "block" });
workspace.selectFirst();
// Or workspace.select("personas"). Buttons also select their associated panel.
```

A workspace manages panel visibility, a selected class on its buttons, and `aria-pressed`. It borrows panels through the session and restores those changes on disposal. It does not render buttons or reinitialize native controls.

## Persistent theme options

`theme.settings.get(defaults = {})` returns a copy of saved options merged with defaults. Nested objects merge; arrays replace. Reading defaults does not save those defaults. `theme.settings.set(patch)` merges and saves a copy of the supplied values through ST's settings save function. `theme.settings.reset()` clears only this theme's saved overrides.

Options live at `extension_settings["Guinevere-UI-Extension"].themeSettings[themeId]`. They survive disabling, switching themes, and page reloads. Keep a stable theme ID to retain its preferences. Defaults, getter results, and setter arguments are not shared mutable objects. Values must be JSON-compatible: finite numbers, strings, booleans, null, arrays, and plain objects. Invalid patches throw before replacing saved preferences.

Themes provide their own option controls. No shared settings form or registry is required to use this API.

## Appearance

Shared CSS variables follow ST's current colors through CSS `var()` references. They update when ST's palette changes, without saving or modifying ST's own theme settings.

| Name | Guinevere CSS variable | ST source |
|---|---|---|
| `text` | `--guinevere-text` | `--SmartThemeBodyColor` |
| `muted` | `--guinevere-muted` | `--SmartThemeEmColor` |
| `surface` | `--guinevere-surface` | `--SmartThemeBlurTintColor` |
| `chatSurface` | `--guinevere-chat-surface` | `--SmartThemeChatTintColor` |
| `userSurface` | `--guinevere-user-surface` | `--SmartThemeUserMesBlurTintColor` |
| `characterSurface` | `--guinevere-character-surface` | `--SmartThemeBotMesBlurTintColor` |
| `border` | `--guinevere-border` | `--SmartThemeBorderColor` |
| `accent` | `--guinevere-accent` | `--SmartThemeQuoteColor` |
| `shadow` | `--guinevere-shadow` | `--SmartThemeShadowColor` |

Use these variables in theme CSS. Override them in a selector scoped to `body[data-guinevere-theme="your-theme-id"]`, or call `theme.appearance.override({ surface: "#131313", accent: "#8ab4f8" })`. Overrides applied through the helper restore on disposal. A `null` override removes that inline override during the session. Appearance overrides are temporary; persist a palette choice through `theme.settings` if desired.

`theme.appearance.getSTColors()` reads ST's current source values, and `getColors()` reads the effective Guinevere tokens on the body. Both return fresh values. CSS overrides on a descendant apply locally and are not reflected by the body-level getter.

## Current ST state

`theme.st.getPersona()` returns `{ name, avatar, avatarUrl }`.

`theme.st.listPersonas()` returns registered personas as `{ name, avatar, avatarUrl }` records. `await theme.st.selectPersona(avatar)` switches through ST's persona function, rejects unavailable personas, and requires an active session.

`theme.st.getConversation()` returns `{ characterId, groupId, chatId, isGroup, name, avatarUrl }`.

`theme.st.getStatus()` returns `{ connection, api, generating }`, with ST's raw connection status. It does not infer whether a named connection is usable.

`theme.st.getContext()` exposes a fresh ST context for operations outside this initial adapter. Read state again when events occur; these getters intentionally do not cache a selected character or chat. Recent-chat listing and navigation adapters will be added alongside the new conversation sidebar.
