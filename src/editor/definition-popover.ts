import { App, Component, MarkdownRenderer, MarkdownView, normalizePath, Plugin } from "obsidian";
import { Definition } from "src/core/model";
import { getSettings } from "src/settings";
import { logDebug, logError } from "src/util/log";

const DEF_POPOVER_ID = "definition-popover";

let definitionPopover: DefinitionPopover;

interface Coordinates {
	left: number;
	right: number;
	top: number;
	bottom: number;
}

export class DefinitionPopover extends Component {
	app: App
	plugin: Plugin;
	// Code mirror editor object for capturing vim events
	cmEditor: any;
	// Ref to the currently mounted popover
	// There should only be one mounted popover at all times
	mountedPopover: HTMLElement | undefined;

	constructor(plugin: Plugin) {
		super();
		this.app = plugin.app;
		this.plugin = plugin;
		this.cmEditor = this.getCmEditor(this.app);
	}

	// Open at editor cursor's position
	openAtCursor(def: Definition) {
		this.unmount();
		this.mountAtCursor(def);

		if (!this.mountedPopover) {
			logError("Mounting definition popover failed");
			return
		}

		this.registerClosePopoverListeners();
	}

	// Open at coordinates (can use for opening at mouse position)
	openAtCoords(def: Definition, coords: Coordinates) {
		this.unmount();
		this.mountAtCoordinates(def, coords);

		if (!this.mountedPopover) {
			logError("mounting definition popover failed");
			return
		}
		this.registerClosePopoverListeners();
	}

	cleanUp() {
		logDebug("Cleaning popover elements");
		const popoverEls = document.getElementsByClassName(DEF_POPOVER_ID);
		for (let i = 0; i < popoverEls.length; i++) {
			popoverEls[i].remove();
		}
	}

	close = () => {
		this.unmount();
	}

	clickClose = () => {
		if (this.mountedPopover?.matches(":hover")) {
			return;
		}
		this.close();
	}

	private getCmEditor(app: App) {
		const activeView = app.workspace.getActiveViewOfType(MarkdownView);
		const cmEditor = (activeView as any)?.editMode?.editor?.cm?.cm;
		if (!cmEditor) {
			logDebug("cmEditor object not found, will not handle vim events for definition popover");
		}
		return cmEditor;
	}

	private shouldOpenToLeft(horizontalOffset: number, containerStyle: CSSStyleDeclaration): boolean {
		return horizontalOffset > parseInt(containerStyle.width) / 2;
	}

	private shouldOpenUpwards(verticalOffset: number, containerStyle: CSSStyleDeclaration): boolean {
		return verticalOffset > parseInt(containerStyle.height) / 2;
	}

	private createElement(def: Definition): HTMLDivElement {
		const el = this.app.workspace.containerEl.createEl("div", {
			cls: "definition-popover",
			attr: {
				id: DEF_POPOVER_ID,
				style: `visibility:hidden`
			},
		});

		el.createEl("h2", { text: def.word });
		if (def.aliases.length > 0) {
			el.createEl("i", { text: def.aliases.join(", ") });
		}
		const contentEl = el.createEl("div");
		contentEl.setAttr("ctx", "def-popup");

		const currComponent = this;
		MarkdownRenderer.render(this.app, def.definition, contentEl, 
			normalizePath(def.file.path), currComponent);
		this.postprocessMarkdown(contentEl, def);

		const popoverSettings = getSettings().defPopoverConfig;
		if (popoverSettings.displayDefFileName) {
			el.createEl("div", {
				text: def.file.basename,
				cls: 'definition-popover-filename'
			});
		}
		return el;
	}

	// Internal links do not work properly in the popover
	// This is to manually open internal links
	private postprocessMarkdown(el: HTMLDivElement, def: Definition) {
		const internalLinks = el.getElementsByClassName("internal-link");
		for (let i = 0; i < internalLinks.length; i++) {
			const linkEl = internalLinks.item(i);
			if (linkEl) {
				linkEl.addEventListener('click', e => {
					e.preventDefault();
					const file = this.app.metadataCache.getFirstLinkpathDest(linkEl.getAttr("href") ?? '', 
						normalizePath(def.file.path))
					this.unmount();
					if (!file) {
						return;
					}
					this.app.workspace.getLeaf().openFile(file)
				});
			}
		}
	}

	private mountAtCursor(def: Definition) {
		let cursorCoords;
		try {
			cursorCoords = this.getCursorCoords();
		} catch (e) {
			logError("Could not open definition popover - could not get cursor coordinates");
			return
		}

		this.mountAtCoordinates(def, cursorCoords);
	}

	private mountAtCoordinates(def: Definition, coords: Coordinates) {
		const workspaceStyle = getComputedStyle(this.app.workspace.containerEl)
		this.mountedPopover = this.createElement(def);

		const positionStyle: Partial<CSSStyleDeclaration> = {
			visibility: 'visible',
		};

		if (this.shouldOpenToLeft(coords.left, workspaceStyle)) {
			positionStyle.right = `${parseInt(workspaceStyle.width) - coords.right}px`;
			positionStyle.maxWidth = 'max(calc(100vw / 3))';
		} else {
			positionStyle.left = `${coords.left}px`;
			positionStyle.maxWidth = 'max(calc(100vw / 3))';
		}

		// Need to offset title bar height as it is not part of the workspace container
		const titleBarHeightCSS = `100vh - ${workspaceStyle.height}`

		if (this.shouldOpenUpwards(coords.top, workspaceStyle)) {
			positionStyle.bottom = `calc(${parseInt(workspaceStyle.height) - coords.top}px + (${titleBarHeightCSS}))`;
			positionStyle.maxHeight = `${coords.top}px`;
		} else {
			positionStyle.top = `calc(${coords.bottom}px - (${titleBarHeightCSS}))`;
			positionStyle.maxHeight = `calc(100vh - ${coords.bottom}px)`;
		}

		this.mountedPopover.setCssStyles(positionStyle);
	}

	private unmount() {
		if (!this.mountedPopover) {
			logDebug("Nothing to unmount, could not find popover element");
			return
		}
		this.mountedPopover.remove();
		this.mountedPopover = undefined;

		this.unregisterClosePopoverListeners();
	}

	// This uses internal non-exposed codemirror API to get cursor coordinates
	// Cursor coordinates seem to be relative to viewport
	private getCursorCoords(): Coordinates {
		const editor = this.app.workspace.activeEditor?.editor;
		// @ts-ignore
		return editor?.cm?.coordsAtPos(editor?.posToOffset(editor?.getCursor()), -1);
	}

	private registerClosePopoverListeners() {
		this.app.workspace.containerEl.addEventListener("keypress", this.close);
		this.app.workspace.containerEl.addEventListener("click", this.clickClose);
		if (this.cmEditor) {
			this.cmEditor.on("vim-keypress", this.close);
		}
		const scroller = this.getCmScroller();
		if (scroller) {
			scroller.addEventListener("scroll", this.close);
		}
	}

	private unregisterClosePopoverListeners() {
		this.app.workspace.containerEl.removeEventListener("keypress", this.close);
		this.app.workspace.containerEl.removeEventListener("click", this.clickClose);
		if (this.cmEditor) {
			this.cmEditor.off("vim-keypress", this.close);
		}
		const scroller = this.getCmScroller();
		if (scroller) {
			scroller.removeEventListener("scroll", this.close);
		}
	}

	private getCmScroller() {
		const scroller = document.getElementsByClassName("cm-scroller");
		if (scroller.length > 0) {
			return scroller[0];
		}
	}

	getPopoverElement() {
		return document.getElementById("definition-popover");
	}
}

// Mount definition popover
export function initDefinitionPopover(plugin: Plugin) {
	if (definitionPopover) {
		definitionPopover.cleanUp();
	}
	definitionPopover = new DefinitionPopover(plugin);
}

export function getDefinitionPopover() {
	return definitionPopover;
}
