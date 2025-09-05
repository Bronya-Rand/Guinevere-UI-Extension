import { select2ChoiceClickSubscribe } from "../../../../../utils.js";
import { world_names } from "../../../../../world-info.js";
import { eventSource, event_types, name1 } from "../../../../../../script.js";
import { user_avatar } from "../../../../../personas.js";
import { debounce } from "../../../../../utils.js";
import { debounce_timeout } from "../../../../../constants.js";

/**
 * Records the detachable elements from the old div to the new div.
 * @type {Object.<string, string>}
 * @property {string} key - The id of the old div (top-settings-holder).
 * @property {string} value - The id of the new div (google-st-preview).
 */
const HTML_CONTAINER = $("#google-messages-container");
const ATTACH_TO_FROM = {};
const profileDataDebounce = debounce(setProfile, debounce_timeout.quick);

function setProfile() {
	if (name1.length > 0) {
		// Replace the text with the selected persona's name
		$("#google-message-modal-profile-name").text(`Hi, ${name1}!`);
		// Replace the image with the selected persona's image
		$("#google-message-modal-profile-icon").attr(
			"src",
			`User Avatars/${user_avatar}`,
		);
		// Replace the settings icon with the selected persona's image
		$("#google-message-settings-profile-icon").attr(
			"src",
			`User Avatars/${user_avatar}`,
		);
	}
}

/**
 * Executes the Google Messages theme code.
 */
export async function execute() {
	const topSettingsHolder = $("#top-settings-holder");
	if (!topSettingsHolder.length) {
		throw Error("Failed to find top-settings-holder.");
	}
	const themeDiv = HTML_CONTAINER;

	try {
		// Add logic to google-message-settings-icon (Profile icon)
		themeDiv.find("#google-message-settings-icon").on("click", () => {
			$("#google-message-settings-modal").toggle();
		});

		// Add logic to google-message-modal-settings-button (ST Settings button)
		themeDiv.find("#google-message-modal-settings-button").on("click", () => {
			$("#google-message-settings-modal").hide();
			$("#google-message-st-settings-modal").toggle();
		});

		// Add logic to google-message-st-modal-close (close button)
		themeDiv.find("#google-message-st-modal-close").on("click", () => {
			$("#google-message-st-settings-modal").hide();
		});

		setProfile();

		// Append themeDiv above top-bar
		topSettingsHolder.before(themeDiv);

		const stOptions = themeDiv.find("#google-st-options");
		const stPreviewer = themeDiv.find("#google-st-preview");

		// Grab data from top-settings-holder
		const drawerButtons = topSettingsHolder.find(".drawer");

		drawerButtons.each(function () {
			const button = $(this).find(".drawer-toggle");
			const backupId = $(this).attr("id"); // for drawer contents with no id

			// Copy button to stOptions
			stOptions.append(button.clone());
			const stButton = stOptions.find(".drawer-toggle").last();

			// Copy all children of drawer-content to stPreviewer
			const drawerContent = $(this).find(".drawer-content");
			if (!drawerContent.attr("id")) {
				drawerContent.attr("id", backupId);
			}

			drawerContent.detach();
			stPreviewer.append(drawerContent);
			stPreviewer
				.find(`#${drawerContent.attr("id")}`)
				.addClass("google-message-st-option-preview");

			// Alter on click to show/hide the cloned div in the previewer
			stButton.on("click", () => {
				stPreviewer.children().css("display", "none");
				drawerContent.css("display", "contents");
				stButton.children().addClass("openIcon");
				stButton.children().removeClass("closedIcon");
				stButton
					.siblings()
					.children()
					.removeClass("openIcon")
					.addClass("closedIcon");
			});

			ATTACH_TO_FROM[$(this).attr("id")] = drawerContent.attr("id");
		});

		// Handles assignment of select2 code to the new div
		const newClick = stPreviewer.find("#WorldInfo").find("#world_info");
		const oldSpan = stPreviewer
			.find("#WorldInfo")
			.find(".range-block-range")
			.find("span");
		oldSpan.remove();

		newClick.select2({
			width: "100%",
			placeholder: "No Worlds active. Click here to select.",
			allowClear: true,
			closeOnSelect: false,
		});

		select2ChoiceClickSubscribe(
			newClick,
			(target) => {
				const name = $(target).text();
				const selectedIndex = world_names.indexOf(name);
				if (selectedIndex !== -1) {
					$("#world_editor_select").val(selectedIndex).trigger("change");
					console.log("Quick selection of world", name);
				}
			},
			{ buttonStyle: true, closeDrawer: true },
		);
	} catch (error) {
		throw Error(error);
	}

	eventSource.on(event_types.SETTINGS_UPDATED, profileDataDebounce);

	topSettingsHolder.css("display", "none");
	$("#top-bar").css("display", "none");
}

export function disable() {
	const topSettingsHolder = $("#top-settings-holder");

	// Detach all elements from the new div to the old div
	const stPreviewer = HTML_CONTAINER.find("#google-st-preview");

	for (const [key, value] of Object.entries(ATTACH_TO_FROM)) {
		const oldDrawerContent = topSettingsHolder.find(`#${key}`);
		const newDrawerContent = stPreviewer.find(`#${value}`);

		newDrawerContent.removeClass("google-message-st-option-preview");

		// Clear all styles
		newDrawerContent.attr("style", "");

		newDrawerContent.detach();
		oldDrawerContent.append(newDrawerContent);
	}

	const oldClick = topSettingsHolder.find("#WorldInfo").find("#world_info");
	const stSpan = topSettingsHolder
		.find("#WorldInfo")
		.find(".range-block-range")
		.find("span");
	stSpan.remove();

	oldClick.select2({
		width: "100%",
		placeholder: "No Worlds active. Click here to select.",
		allowClear: true,
		closeOnSelect: false,
	});

	select2ChoiceClickSubscribe(
		oldClick,
		(target) => {
			const name = $(target).text();
			const selectedIndex = world_names.indexOf(name);
			if (selectedIndex !== -1) {
				$("#world_editor_select").val(selectedIndex).trigger("change");
				console.log("Quick selection of world", name);
			}
		},
		{ buttonStyle: true, closeDrawer: true },
	);

	// remove display element from top-settings-holder
	topSettingsHolder.css("display", "flex");
	$("#top-bar").css("display", "flex");
}
