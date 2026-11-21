/**
 * Template Theme
 * This is basically a code template in case you want to create your own theme
 * with buttons, input boxes, etc.
 *
 * Before getting started, make sure to have prior knowledge of HTML, CSS, and JS
 * as well as jQuery and the ST codebase itself. You may need to call some ST functions
 * that are documented or undocumented.
 *
 * While you can use the 'google-messages-legacy' theme as a reference, that code is overly
 * complex and may be difficult to understand. This template is meant to be a simpler
 * example to get you started.
 */

/**
 * Executes the Template theme code.
 * Guinevere passes a fresh session for tracked changes and persistent options.
 * Themes with an existing zero-argument execute() still work.
 */
export async function execute(theme) {
	// Resolve DOM nodes here: the module is cached across theme applications.
	const HTML_CONTAINER = $(theme.element("#template-container"));
	const options = theme.settings.get({ exampleText: "Place HTML code here" });
	try {
		// Your code here (e.g. event listeners, logic, etc.)
		// Preferably assign jQuery logic to the new stuff you added to your theme.
		if (!HTML_CONTAINER.length) throw new Error("Template container not found.");
		HTML_CONTAINER.find("p").text(options.exampleText);
		// Save an option from your own controls with theme.settings.set({ ... }).
		// Use theme.on(), theme.movePanel(), etc. for automatic cleanup.
		console.log("Template theme code executed.");
	} catch (error) {
		throw error;
	}
}

/**
 * Disables the Template theme code.
 */
export function disable() {
	// Optional custom cleanup. The loader disposes helper-owned changes afterward.
}
