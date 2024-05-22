import { App, MarkdownView, Plugin } from "obsidian";
import { Definition } from "src/core/model";
import { logDebug, logError, logInfo } from "src/util/log";

const DEF_DROPDOWN_ID = "definition-dropdown";

let definitionDropdown: DefinitionDropdown;

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

	private getCmEditor(app: App) {
		const activeView = app.workspace.getActiveViewOfType(MarkdownView);
		const cmEditor = (activeView as any)?.editMode?.editor?.cm?.cm;
		if (!cmEditor) {
			logInfo("cmEditor object not found, will not handle vim events for definition dropdown");
		}
		return cmEditor;
	}

	private mount(def: Definition) {
		let cursorCoords;
		try {
			cursorCoords = this.getCursorCoords();
		} catch (e) {
			logError("Could not open definition dropdown - could not get cursor coordinates");
			return
		}

		// TODO: Offset based on font 
		let cmEditor;
		let editorElems = this.app.workspace.containerEl.getElementsByClassName("cm-editor");
		if (editorElems.length > 0) {
			cmEditor = editorElems[0];
		} 
		let top = Math.floor(cursorCoords.top) + 20;
		let left = Math.floor(cursorCoords.left);

		const workspaceStyle = getComputedStyle(this.app.workspace.containerEl)
		const containerStyle = getComputedStyle(cmEditor ?? this.app.workspace.containerEl);

		const leftLimit = parseInt(workspaceStyle.width) - parseInt(containerStyle.width);

		this.mountedDropdown = this.app.workspace.containerEl.createEl("div", {
			cls: "definition-dropdown",
			attr: {
				id: DEF_DROPDOWN_ID,
				style: `max-width:${containerStyle.width};visibility:hidden`
			},
		});

		const dropdownStyle = getComputedStyle(this.mountedDropdown);

		// Check if should open to the left or right
		if (left > parseInt(containerStyle.width) / 2) {
			console.log("HERE")
			console.log(left)
			// Open to the left
			left -= parseInt(dropdownStyle.width);
			console.log(left)
		}

		// Shift horizontally based on left limit if required
		left = Math.max(left, leftLimit);

		// Check if should open upwards or downwards
		if (top > parseInt(containerStyle.height) / 2) {
			// Open upwards
			top -= parseInt(dropdownStyle.height) + 20;
		}

		this.mountedDropdown.setCssStyles({
			top: `${top}px`,
			left: `${left}px`,
			visibility: 'visible'
		});

		this.mountedDropdown.createEl("h2", { text: def.word });
		if (def.fullName != "") {
			this.mountedDropdown.createEl("i", { text: def.fullName });
		}
		this.mountedDropdown.createEl("p", { 
			text: def.definition,
			attr: {
				style: "white-space: pre-line"
			}
		});
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

	close = () => {
		this.unmount();
	}

	clickClose = () => {
		if (this.mountedDropdown?.matches(":hover")) {
			return;
		}
		this.close();
	}

	private getCursorCoords() {
		const editor = this.app.workspace.activeEditor?.editor;
		// @ts-ignore
		return editor?.cm?.coordsAtPos(editor?.posToOffset(editor?.getCursor()), -1);
	}


	open(def: Definition) {
		this.unmount();


		this.mount(def);

		if (!this.mountedDropdown) {
			logError("Mounting definition dropdown failed");
			return
		}

		this.registerCloseDropdownListeners();
	}

	cleanUp() {
		logInfo("Cleaning dropdown elements");
		const dropdownEls = document.getElementsByClassName(DEF_DROPDOWN_ID);
		for (let i = 0; i < dropdownEls.length; i++) {
			dropdownEls[i].remove();
		}
	}

	private registerCloseDropdownListeners() {
		this.app.workspace.containerEl.addEventListener("keypress", this.close);
		this.app.workspace.containerEl.addEventListener("click", this.clickClose);
		if (this.cmEditor) {
			this.cmEditor.on("vim-keypress", this.close);
		}
	}

	private unregisterCloseDropdownListeners() {
		this.app.workspace.containerEl.removeEventListener("keypress", this.close);
		this.app.workspace.containerEl.removeEventListener("click", this.clickClose);
		if (this.cmEditor) {
			this.cmEditor.off("vim-keypress", this.close);
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
