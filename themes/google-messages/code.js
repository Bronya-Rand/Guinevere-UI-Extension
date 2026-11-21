export async function execute(theme) {
    const root = theme.element("#gm-shell");
    const find = selector => root.querySelector(selector);
    const settings = find("#gm-settings"), profile = find("#gm-profile"), appearance = find("#gm-appearance");
    const options = theme.settings.get({ collapsed: false, palette: "google", background: false });
    const panels = theme.st.listPanels();
    const categories = new Map();
    const labels = { responseSettings: "Generation", connectionSettings: "Connections", advancedFormatting: "Prompts & formatting", worldInfo: "Lorebooks", userSettings: "Interface & behavior", backgrounds: "Backgrounds", extensions: "Extensions", personas: "Personas", characters: "Contacts & groups" };
    let returnFocus;
    let avatarRevision = 0;
    function avatarSource(source) {
        if (!avatarRevision || /^(data:|blob:)/i.test(source)) return source;
        const url = new URL(source, document.baseURI);
        url.searchParams.set("gm-avatar", String(avatarRevision));
        return url.href;
    }

    function closeOverlays() {
        settings.hidden = profile.hidden = appearance.hidden = true;
        find("#gm-profile-button").setAttribute("aria-expanded", "false");
    }
    function openOverlay(element, focusTarget) {
        returnFocus = document.activeElement;
        closeOverlays();
        element.hidden = false;
        focusTarget?.focus();
    }
    function closeAndFocus() { closeOverlays(); if (returnFocus?.isConnected) returnFocus.focus(); }
    function setNavigation(open, save = false) {
        theme.setAttribute(document.body, "data-gm-navigation", open ? "open" : "closed");
        find("#gm-menu").setAttribute("aria-expanded", String(open));
        find("#gm-nav-backdrop").hidden = !open;
        if (save) { options.collapsed = !open; theme.settings.set({ collapsed: !open }); }
    }
    function applyAppearance() {
        const google = { text: "#e3e3e3", muted: "#a9adb3", surface: "#202124", chatSurface: "#202124", accent: "#a8c7fa", border: "#414448" };
        theme.appearance.override(options.palette === "google" ? google : Object.fromEntries(Object.keys(google).map(key => [key, null])));
        theme.setAttribute(document.body, "data-gm-background", String(options.background));
        find("#gm-palette").value = options.palette;
        find("#gm-background").checked = options.background;
    }
    const workspace = theme.createPanelWorkspace({ target: find("#gm-settings-panels"), onSelect(entry) { find("#gm-settings-title").textContent = entry.button.textContent; } });
    for (const descriptor of panels) {
        const button = document.createElement("button");
        button.type = "button";
        button.textContent = labels[descriptor.key] || descriptor.label;
        find("#gm-settings-tabs").append(button);
        theme.ownElement(button);
        workspace.add({ panel: descriptor.element, button });
        categories.set(descriptor.key, descriptor.element);
    }
    workspace.selectFirst();
    function openPanel(key) {
        const panel = categories.get(key);
        if (!panel) return;
        workspace.select(panel);
        openOverlay(settings, find("#gm-settings-close"));
        if (matchMedia("(max-width: 760px)").matches) setNavigation(false);
    }
    theme.on(root, "click", event => {
        const button = event.target.closest("[data-gm-panel]");
        if (button) openPanel(button.dataset.gmPanel);
    });
    theme.on(find("#gm-menu"), "click", () => setNavigation(document.body.dataset.gmNavigation !== "open", true));
    theme.on(find("#gm-nav-backdrop"), "click", () => setNavigation(false));
    theme.on(find("#gm-back"), "click", () => setNavigation(true));
    theme.on(find("#gm-settings-close"), "click", closeAndFocus);
    theme.on(find("#gm-appearance-close"), "click", closeAndFocus);
    theme.on(find("#gm-profile-close"), "click", closeAndFocus);
    for (const overlay of [settings, appearance]) theme.on(overlay, "click", event => { if (event.target === overlay) closeAndFocus(); });
    theme.on(find("#gm-profile-button"), "click", () => {
        if (!profile.hidden) return closeAndFocus();
        openOverlay(profile, find("#gm-profile-close"));
        find("#gm-profile-button").setAttribute("aria-expanded", "true");
    });
    function openAppearance() { openOverlay(appearance, find("#gm-palette")); }
    theme.on(find("#gm-appearance-button"), "click", openAppearance);
    theme.on(find("#gm-profile-appearance"), "click", openAppearance);
    theme.on(find("#gm-palette"), "change", event => { options.palette = event.target.value; theme.settings.set({ palette: options.palette }); applyAppearance(); });
    theme.on(find("#gm-background"), "change", event => { options.background = event.target.checked; theme.settings.set({ background: options.background }); applyAppearance(); });
    theme.on(find("#gm-connection"), "click", () => openPanel("connectionSettings"));
    theme.on(find("#gm-chat-details"), "click", () => openPanel("characters"));
    theme.on(find("#gm-chat-actions"), "click", () => $("#options_button").trigger("click"));
    theme.on(find("#gm-home"), "click", () => {
        // ST's own close action opens its real welcome screen.
        const action = document.querySelector("#option_close_chat");
        if (action && theme.st.getContext().chatId !== undefined) $(action).trigger("click");
        closeOverlays();
        setNavigation(false);
    });
    function update() {
        const persona = theme.st.getPersona();
        const context = theme.st.getContext();
        const conversation = theme.st.getConversation();
        const status = theme.st.getStatus();
        const active = context.chatId !== undefined && context.chatId !== null;
        find("#gm-profile-image").src = avatarSource(persona.avatarUrl);
        find("#gm-persona-name").textContent = persona.name;
        find("#gm-chat-name").textContent = active ? conversation.name : "Welcome";
        find("#gm-chat-status").textContent = active ? (status.generating ? "Generating…" : conversation.isGroup ? "Group conversation" : "Conversation") : "Choose a conversation to get started";
        find("#gm-chat-actions").disabled = !active;
        find("#gm-connection").textContent = status.connection && status.connection !== "no_connection" ? status.connection : "Connect";
        const list = find("#gm-persona-list");
        list.replaceChildren();
        for (const item of theme.st.listPersonas()) {
            const button = document.createElement("button");
            button.type = "button"; button.dataset.persona = item.avatar;
            button.setAttribute("aria-pressed", String(item.avatar === persona.avatar));
            const image = document.createElement("img"); image.src = avatarSource(item.avatarUrl); image.alt = "";
            const name = document.createElement("span"); name.textContent = item.name;
            button.append(image, name); list.append(button);
        }
    }
    theme.on(find("#gm-persona-list"), "click", async event => {
        const button = event.target.closest("[data-persona]");
        if (!button) return;
        button.disabled = true;
        try { await theme.st.selectPersona(button.dataset.persona); if (theme.active) update(); }
        catch { if (theme.active) find("#gm-profile-error").textContent = "Could not switch persona. Open Manage personas to try again."; }
        finally { if (theme.active && button.isConnected) button.disabled = false; }
    });
    theme.on(document, "click", event => {
        if (!profile.hidden && !profile.contains(event.target) && !find("#gm-profile-button").contains(event.target)) closeAndFocus();
    });
    theme.on(document, "keydown", event => {
        const modal = !settings.hidden ? settings : !appearance.hidden ? appearance : null;
        if (event.key === "Escape" && (modal || !profile.hidden)) { event.preventDefault(); closeAndFocus(); }
        if (event.key === "Tab" && modal) {
            const controls = [...modal.querySelectorAll('button, input, select, textarea, a[href], [tabindex="0"]')].filter(element => !element.disabled && element.getClientRects().length);
            const first = controls[0], last = controls.at(-1);
            if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
            else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
        }
    });
    function refreshAvatars() { avatarRevision = Math.max(Date.now(), avatarRevision + 1); update(); }
    for (const name of ["settingsUpdated", "personaChanged", "generationStarted", "generationEnded", "generationStopped", "onlineStatusChanged"]) theme.onST(name, update, { optional: true });
    theme.onST("personaUpdated", refreshAvatars, { optional: true });
    // ST rebuilds this list after avatar uploads, including same-file overwrites
    // which do not emit PERSONA_UPDATED. Observe ST's list, never our own images.
    const avatarList = document.getElementById("user_avatar_block");
    if (avatarList) theme.observe(avatarList, { childList: true, subtree: true, attributes: true, attributeFilter: ["src"] }, refreshAvatars);
    theme.onST("chatChanged", () => { update(); closeOverlays(); if (matchMedia("(max-width: 760px)").matches) setNavigation(false); }, { optional: true });
    theme.setStyle("#top-bar", "display", "none");
    theme.setStyle("#top-settings-holder", "display", "none");
    setNavigation(!options.collapsed && !matchMedia("(max-width: 760px)").matches);
    applyAppearance(); update();
}
