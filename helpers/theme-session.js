import { createThemeSettings } from "./theme-settings.js";
import { createAppearance } from "./appearance.js";
import { createSTUI, createPanelWorkspace } from "./st-ui.js";

const nodeOwners = new WeakMap();
let sessionNumber = 0;
const eventAliases = {
	settingsUpdated: "SETTINGS_UPDATED",
	personaChanged: "PERSONA_CHANGED",
	personaUpdated: "PERSONA_UPDATED",
	chatChanged: "CHAT_CHANGED",
	userMessageRendered: "USER_MESSAGE_RENDERED",
	characterMessageRendered: "CHARACTER_MESSAGE_RENDERED",
	generationStarted: "GENERATION_STARTED",
	generationEnded: "GENERATION_ENDED",
	generationStopped: "GENERATION_STOPPED",
	onlineStatusChanged: "ONLINE_STATUS_CHANGED",
};

/** One session per activation; the loader disposes it before removing assets. */
export function createThemeSession({ id, getSettings, saveSettings, getContext }) {
	const namespace = `.guinevereTheme${++sessionNumber}`;
	const cleanups = { resources: [], restore: [], elements: [] };
	const mutations = new WeakMap();
	const moves = new WeakMap();
	const ownedElements = new WeakSet();
	const controller = new AbortController();
	let closing = false;
	let disposed = false;
	let disposal = null;

	function assertActive() {
		if (closing) throw new Error(`Theme session '${id}' is closing or disposed.`);
	}

	function register(cleanup, phase = "resources") {
		assertActive();
		if (typeof cleanup !== "function") throw new TypeError("Cleanup must be a function.");
		const entry = { done: false, running: null };
		entry.run = async () => {
			if (entry.done) return;
			if (!entry.running) {
				entry.running = Promise.resolve(cleanup()).then(() => { entry.done = true; }).finally(() => { entry.running = null; });
			}
			return entry.running;
		};
		cleanups[phase].push(entry);
		return entry.run;
	}

	function remember(element, key, cleanup) {
		let keys = mutations.get(element);
		if (!keys) mutations.set(element, keys = new Set());
		if (!keys.has(key)) {
			register(cleanup, "restore");
			keys.add(key);
		}
	}

	const session = {
		id,
		signal: controller.signal,
		get active() { return !closing; },
		get disposed() { return disposed; },
		element(target) {
			const elements = typeof target === "string" ? document.querySelectorAll(target) : target?.nodeType === 1 ? [target] : target;
			if (elements?.length !== 1 || elements[0]?.nodeType !== 1) {
				throw new Error(`Expected exactly one element: ${String(target)}`);
			}
			return elements[0];
		},
		addCleanup(cleanup) {
			return register(cleanup);
		},
		on(target, events, handler) {
			assertActive();
			const elements = $(typeof target === "string" ? document.querySelectorAll(target) : target);
			if (!elements.length || typeof handler !== "function") throw new Error("An event target and handler are required.");
			const names = events.trim().split(/\s+/).map(event => event + namespace).join(" ");
			let listening = true;
			const listener = function (...args) { if (!closing && listening) return handler.apply(this, args); };
			const stop = register(() => { listening = false; elements.off(names, listener); });
			elements.on(names, listener);
			return stop;
		},
		onST(event, handler, { optional = false } = {}) {
			assertActive();
			const context = getContext();
			const types = context.eventTypes || context.event_types || {};
			const type = types[eventAliases[event] || event] || (Object.values(types).includes(event) ? event : null);
			if (!type) {
				if (optional) return async () => {};
				throw new Error(`SillyTavern event is unavailable: ${event}`);
			}
			if (typeof handler !== "function") throw new TypeError("An event handler is required.");
			let listening = true;
			const listener = (...args) => { if (!closing && listening) return handler(...args); };
			const stop = register(() => { listening = false; context.eventSource.removeListener(type, listener); });
			context.eventSource.on(type, listener);
			return stop;
		},
		observe(target, options, callback) {
			assertActive();
			const observer = new MutationObserver((...args) => { if (!closing) callback(...args); });
			register(() => observer.disconnect());
			observer.observe(session.element(target), options);
			return observer;
		},
		timeout(callback, delay) {
			assertActive();
			const timer = setTimeout(() => { if (!closing) callback(); }, delay);
			register(() => clearTimeout(timer));
			return timer;
		},
		interval(callback, delay) {
			assertActive();
			const timer = setInterval(() => { if (!closing) callback(); }, delay);
			register(() => clearInterval(timer));
			return timer;
		},
		setStyle(target, property, value, priority = "") {
			assertActive();
			const element = session.element(target);
			const oldValue = element.style.getPropertyValue(property);
			const oldPriority = element.style.getPropertyPriority(property);
			const hadStyle = element.hasAttribute("style");
			remember(element, `style:${property}`, () => {
				if (oldValue) element.style.setProperty(property, oldValue, oldPriority);
				else element.style.removeProperty(property);
				if (!hadStyle && element.getAttribute("style") === "") element.removeAttribute("style");
			});
			if (value === null) element.style.removeProperty(property);
			else element.style.setProperty(property, value, priority);
		},
		setClass(target, name, enabled = true) {
			assertActive();
			const element = session.element(target);
			const existed = element.classList.contains(name);
			const hadClass = element.hasAttribute("class");
			remember(element, `class:${name}`, () => {
				element.classList.toggle(name, existed);
				if (!hadClass && element.getAttribute("class") === "") element.removeAttribute("class");
			});
			element.classList.toggle(name, Boolean(enabled));
		},
		setAttribute(target, name, value) {
			assertActive();
			const element = session.element(target);
			const previous = element.getAttribute(name);
			remember(element, `attribute:${name}`, () => {
				if (previous === null) element.removeAttribute(name);
				else element.setAttribute(name, previous);
			});
			if (value === null) element.removeAttribute(name);
			else element.setAttribute(name, value);
		},
		move(target, destination) {
			assertActive();
			const element = session.element(target);
			const parent = session.element(destination);
			if (element === parent || element.contains(parent)) throw new Error("Cannot move an element into itself.");
			if (nodeOwners.has(element) && nodeOwners.get(element) !== session) throw new Error("Element is already borrowed by another theme session.");
			if (!moves.has(element)) {
				if (!element.parentNode) throw new Error("Borrowed elements must have an original parent.");
				const record = { parent: element.parentNode, next: element.nextSibling, placeholder: document.createComment(`Guinevere: ${id}`) };
				element.before(record.placeholder);
				moves.set(element, record);
				nodeOwners.set(element, session);
				register(() => {
					if (record.placeholder.parentNode) record.placeholder.replaceWith(element);
					else record.parent.insertBefore(element, record.next?.parentNode === record.parent ? record.next : null);
					nodeOwners.delete(element);
				}, "restore");
			}
			// Native DOM moves preserve jQuery handlers, data, and widgets.
			parent.append(element);
			return element;
		},
		movePanel(panel, destination) {
			return session.move(session.st.getPanel(panel), destination);
		},
		ownElement(target) {
			assertActive();
			const element = session.element(target);
			if (nodeOwners.has(element)) throw new Error("A borrowed element cannot be owned by a theme.");
			if (!ownedElements.has(element)) {
				ownedElements.add(element);
				register(() => $(element).remove(), "elements");
			}
			return element;
		},
		createPanelWorkspace(options) {
			assertActive();
			return createPanelWorkspace(session, options);
		},
		dispose() {
			if (disposed) return Promise.resolve();
			if (disposal) return disposal;
			closing = true;
			controller.abort();
			disposal = (async () => {
				const errors = [];
				// Reverse registration order within each phase. Borrowed nodes must
				// be restored before removing any owned element, regardless of order.
				for (const phase of ["resources", "restore", "elements"]) {
					if (phase === "elements" && errors.length) break;
					for (const entry of [...cleanups[phase]].reverse()) {
						try { await entry.run(); }
						catch (error) { errors.push(error); }
					}
				}
				if (errors.length) throw new AggregateError(errors, `Could not dispose theme '${id}'.`);
				disposed = true;
			})().finally(() => { disposal = null; });
			return disposal;
		},
	};
	session.settings = createThemeSettings(id, getSettings, saveSettings);
	session.st = createSTUI(session, getContext);
	session.appearance = createAppearance(session);
	session.setAttribute(document.body, "data-guinevere-theme", id);
	return session;
}
