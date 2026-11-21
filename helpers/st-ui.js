import { default_user_avatar, default_avatar, isGenerating } from "../../../../../script.js";
import { user_avatar, setUserAvatar } from "../../../../personas.js";

const panelSelectors = Object.freeze({
	responseSettings: "#left-nav-panel",
	connectionSettings: "#rm_api_block",
	advancedFormatting: "#AdvancedFormatting",
	worldInfo: "#WorldInfo",
	userSettings: "#user-settings-block",
	backgrounds: "#Backgrounds",
	extensions: "#rm_extensions_block",
	personas: "#PersonaManagement",
	characters: "#right-nav-panel",
});

/** Keep ST selectors and state reads in one place. Every read uses fresh context. */
export function createSTUI(session, getContext) {
	function getPanel(panel) {
		return session.element(typeof panel === "string" && Object.hasOwn(panelSelectors, panel) ? panelSelectors[panel] : panel);
	}
	return {
		getContext,
		getPanel,
		listPanels() {
			return [...document.querySelectorAll("#top-settings-holder > .drawer")].flatMap(drawer => {
				const toggle = drawer.querySelector(":scope > .drawer-toggle");
				if (!toggle) return [];
				return [...drawer.querySelectorAll(":scope > .drawer-content")].map(element => ({
					key: Object.keys(panelSelectors).find(key => element.matches(panelSelectors[key])) || element.id,
					element,
					toggle,
					label: toggle.getAttribute("title") || toggle.querySelector("[title]")?.getAttribute("title") || "Settings",
				}));
			});
		},
		getPersona() {
			const context = getContext();
			return {
				name: context.name1 || "SillyTavern User",
				avatar: user_avatar,
				avatarUrl: user_avatar ? context.getThumbnailUrl("persona", user_avatar) : default_user_avatar,
			};
		},
		listPersonas() {
			const context = getContext();
			return Object.entries(context.powerUserSettings?.personas || {}).map(([avatar, name]) => ({
				avatar, name, avatarUrl: context.getThumbnailUrl("persona", avatar),
			}));
		},
		async selectPersona(avatar) {
			if (!session.active) throw new Error("Theme is no longer active.");
			if (!Object.hasOwn(getContext().powerUserSettings?.personas || {}, avatar)) throw new Error("Persona is unavailable.");
			await setUserAvatar(avatar);
		},
		getConversation() {
			const context = getContext();
			const isGroup = context.groupId !== undefined && context.groupId !== null && context.groupId !== "";
			const entity = isGroup
				? context.groups?.find(group => String(group.id) === String(context.groupId))
				: context.characters?.[context.characterId];
			return {
				characterId: context.characterId,
				groupId: context.groupId,
				chatId: context.chatId,
				isGroup,
				name: entity?.name || context.name2 || "",
				avatarUrl: isGroup ? entity?.avatar_url || default_avatar
					: entity?.avatar ? context.getThumbnailUrl("avatar", entity.avatar) : default_avatar,
			};
		},
		getStatus() {
			const context = getContext();
			return { connection: context.onlineStatus, api: context.mainApi, generating: isGenerating() };
		},
	};
}

/** Themes supply the markup; this manages selection and reversible panel moves. */
export function createPanelWorkspace(session, { target, selectedClass = "is-selected", onSelect } = {}) {
	const destination = session.element(target);
	const entries = [];
	const workspace = {
		add({ panel, button, display = "block" }) {
			const element = session.st.getPanel(panel);
			const control = session.element(button);
			if (entries.some(entry => entry.panel === element)) throw new Error("Panel already belongs to this workspace.");
			session.movePanel(element, destination);
			session.setStyle(element, "display", "none");
			const entry = { panel: element, button: control, display };
			entries.push(entry);
			session.on(control, "click", event => {
				event.preventDefault();
				workspace.select(element);
			});
			return entry;
		},
		select(panel) {
			const element = session.st.getPanel(panel);
			const selected = entries.find(entry => entry.panel === element);
			if (!selected) throw new Error("Panel does not belong to this workspace.");
			for (const entry of entries) {
				const active = entry === selected;
				session.setStyle(entry.panel, "display", active ? entry.display : "none");
				if (selectedClass) session.setClass(entry.button, selectedClass, active);
				session.setAttribute(entry.button, "aria-pressed", String(active));
			}
			onSelect?.(selected, [...entries]);
			return selected;
		},
		selectFirst() {
			if (!entries.length) throw new Error("No SillyTavern settings panels were found.");
			return workspace.select(entries[0].panel);
		},
	};
	return workspace;
}
