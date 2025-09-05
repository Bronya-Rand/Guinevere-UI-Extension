/**
 * Template Theme
 * This is basically a code template in case you want to create your own theme
 * with buttons, input boxes, etc.
 *
 * Before getting started, make sure to have prior knowledge of HTML, CSS, and JS
 * as well as jQuery and the ST codebase itself. You may need to call some ST functions
 * that are documented or undocumented.
 *
 * While you can use the 'google-messages' theme as a reference, that code is overly
 * complex and may be difficult to understand. This template is meant to be a simpler
 * example to get you started.
 */

const HTML_CONTAINER = $("#template-container");

/**
 * Executes the Template theme code.
 * @note Breaking Change as of Guinevere 2.0: `auto` and `themeDiv` parameters are now removed.
 * It is now recommended to make a container of your HTML contents in your theme's HTML file.
 */
export async function execute() {
	try {
		// Your code here (e.g. event listeners, logic, etc.)
		// Preferably assign jQuery logic to the new stuff you added to your theme.
		console.log("Template theme code executed.");
	} catch (error) {
		throw Error(error);
	}
}

/**
 * Disables the Template theme code.
 */
export function disable() {
	// Your removal code here (if applicable)
}
