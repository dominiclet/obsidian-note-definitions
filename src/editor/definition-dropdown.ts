import { App, MarkdownView, Plugin } from "obsidian";
import { Definition } from "src/core/model";
import { logDebug, logError } from "src/util/log";

const DEF_DROPDOWN_ID = "definition-dropdown";

let definitionDropdown: DefinitionDropdown;

interface Coordinates {
	left: number;
	right: number;
	top: number;
	bottom: number;
}

export class DefinitionDropdown {
	app: App
	plugin: Plugin;
	// Code mirror editor object for capturing vim events
	cmEditor: any;
	// Ref to the currently mounted dropdown
	// There should only be one mounted dropdown at all times
	mountedDropdown: HTMLElement | undefined;

	constructor(plugin: Plugin) {
		this.app = plugin.app;
		this.plugin = plugin;
		this.cmEditor = this.getCmEditor(this.app);
	}

	// Open at editor cursor's position
	openAtCursor(def: Definition) {
		this.unmount();
		this.mountAtCursor(def);

		if (!this.mountedDropdown) {
			logError("Mounting definition dropdown failed");
			return
		}

		this.registerCloseDropdownListeners();
	}

	// Open at coordinates (can use for opening at mouse position)
	openAtCoords(def: Definition, coords: Coordinates) {
		this.unmount();
		this.mountAtCoordinates(def, coords);

		if (!this.mountedDropdown) {
			logError("mounting definition dropdown failed");
			return
		}
		this.registerCloseDropdownListeners();
	}

	cleanUp() {
		logDebug("Cleaning dropdown elements");
		const dropdownEls = document.getElementsByClassName(DEF_DROPDOWN_ID);
		for (let i = 0; i < dropdownEls.length; i++) {
			dropdownEls[i].remove();
		}
	}

	close = () => {
		this.unmount();
	}

	clickClose = () => {
		if (this.mountedDropdown?.matches(":hover")) {
			return;
		}
		this.close();
	}

	private getCmEditor(app: App) {
		const activeView = app.workspace.getActiveViewOfType(MarkdownView);
		const cmEditor = (activeView as any)?.editMode?.editor?.cm?.cm;
		if (!cmEditor) {
			logDebug("cmEditor object not found, will not handle vim events for definition dropdown");
		}
		return cmEditor;
	}

	// True if open towards right, otherwise left
	private shouldOpenToRight(horizontalOffset: number, containerStyle: CSSStyleDeclaration): boolean {
		return horizontalOffset > parseInt(containerStyle.width) / 2;
	}

	private shouldOpenUpwards(verticalOffset: number, containerStyle: CSSStyleDeclaration): boolean {
		return verticalOffset > parseInt(containerStyle.height) / 2;
	}

	private createElement(def: Definition): HTMLDivElement {
		const el = this.app.workspace.containerEl.createEl("div", {
			cls: "definition-dropdown",
			attr: {
				id: DEF_DROPDOWN_ID,
				style: `visibility:hidden`
			},
		});

		el.createEl("h2", { text: def.word });
		if (def.fullName != "") {
			el.createEl("i", { text: def.fullName });
		}
		el.createEl("p", { 
			text: def.definition,
			attr: {
				style: "white-space: pre-line"
			}
		});

		return el;
	}

	private mountAtCursor(def: Definition) {
		let cursorCoords;
		try {
			cursorCoords = this.getCursorCoords();
		} catch (e) {
			logError("Could not open definition dropdown - could not get cursor coordinates");
			return
		}

		this.mountAtCoordinates(def, cursorCoords);
	}

	private mountAtCoordinates(def: Definition, coords: Coordinates) {
		const workspaceStyle = getComputedStyle(this.app.workspace.containerEl)
		this.mountedDropdown = this.createElement(def);

		const positionStyle: Partial<CSSStyleDeclaration> = {
			visibility: 'visible',
			maxWidth: '500px'
		};

		if (this.shouldOpenToRight(coords.left, workspaceStyle)) {
			positionStyle.right = `${parseInt(workspaceStyle.width) - coords.left}px`;
		} else {
			positionStyle.left = `${coords.left}px`;
		}

		if (this.shouldOpenUpwards(coords.top, workspaceStyle)) {
			positionStyle.bottom = `${parseInt(workspaceStyle.height) - coords.top}px`;
		} else {
			positionStyle.top = `${coords.bottom}px`;
		}

		this.mountedDropdown.setCssStyles(positionStyle);
	}

	private unmount() {
		if (!this.mountedDropdown) {
			logDebug("Nothing to unmount, could not find dropdown element");
			return
		}
		this.mountedDropdown.remove();
		this.mountedDropdown = undefined;

		this.unregisterCloseDropdownListeners();
	}

	private getCursorCoords(): Coordinates {
		const editor = this.app.workspace.activeEditor?.editor;
		// @ts-ignore
		return editor?.cm?.coordsAtPos(editor?.posToOffset(editor?.getCursor()), -1);
	}

	private registerCloseDropdownListeners() {
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

	private unregisterCloseDropdownListeners() {
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

	getDropdownElement() {
		return document.getElementById("definition-dropdown");
	}
}

// Mount definition dropdown
export function initDefinitionDropdown(plugin: Plugin) {
	if (definitionDropdown) {
		definitionDropdown.cleanUp();
	}
	definitionDropdown = new DefinitionDropdown(plugin);
}

export function getDefinitionDropdown() {
	return definitionDropdown;
}
