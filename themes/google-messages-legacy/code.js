/** Apply the original profile-popover/settings-modal theme. */
export async function execute(theme) {
	const root = $(theme.element("#google-messages-container"));
	const holder = theme.element("#top-settings-holder");
	const options = root.find("#google-st-options");
	const preview = root.find("#google-st-preview");
	if (options.length !== 1 || preview.length !== 1) {
		throw new Error("The Google Messages (Legacy) theme could not find its UI containers.");
	}

	// Preserve the original dark modal surface; other colors inherit ST's palette.
	theme.appearance.override({ surface: "#131313" });
	const profileModal = root.find("#google-message-settings-modal");
	const settingsModal = root.find("#google-message-st-settings-modal");
	theme.on(root.find("#google-message-settings-icon"), "click", () => profileModal.toggle());
	theme.on(root.find("#google-message-modal-settings-button"), "click", () => {
		profileModal.hide();
		settingsModal.show();
	});
	theme.on(root.find("#google-message-st-modal-close"), "click", () => settingsModal.hide());

	const workspace = theme.createPanelWorkspace({
		target: preview,
		onSelect(selected, entries) {
			for (const entry of entries) {
				$(entry.button).find(".drawer-icon")
					.toggleClass("openIcon", entry === selected)
					.toggleClass("closedIcon", entry !== selected);
			}
		},
	});

	for (const { element, toggle, label } of theme.st.listPanels()) {
		// Create navigation without duplicating ST's IDs or native click handlers.
		const button = $('<button type="button" class="drawer-toggle google-message-st-option-toggle"></button>');
		button.append($(toggle).children().clone());
		button.find("[id]").removeAttr("id");
		button.attr("aria-label", label);
		button.find(".drawer-icon").removeClass("openIcon").addClass("closedIcon");
		theme.ownElement(button);
		options.append(button);
		theme.setClass(element, "google-message-st-option-preview");
		workspace.add({ panel: element, button });
	}
	workspace.selectFirst();

	function setProfile() {
		const persona = theme.st.getPersona();
		root.find("#google-message-modal-profile-name").text(`Hi, ${persona.name}!`);
		root.find("#google-message-modal-profile-icon, #google-message-settings-profile-icon").attr("src", persona.avatarUrl);
	}
	setProfile();
	theme.onST("settingsUpdated", setProfile);
	theme.onST("personaChanged", setProfile, { optional: true });
	theme.onST("personaUpdated", setProfile, { optional: true });
	theme.setStyle(holder, "display", "none");
	theme.setStyle("#top-bar", "display", "none");
	// The loader disposes the session, restoring panels, styles, and listeners.
}
