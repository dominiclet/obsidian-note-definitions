import { App, Modal } from "obsidian";
import { getDefFileManager } from "src/core/def-file-manager";
import { DuplicateDefinition } from "src/core/model";

export class DuplicateDefinitionModal {
	app: App;
	modal: Modal;

	constructor(app: App) {
		this.app = app;
		this.modal = new Modal(app);
	}

	open() {
		const duplicates = getDefFileManager().getDuplicateDefinitions();
		const { contentEl } = this.modal;
		contentEl.empty();

		if (duplicates.length === 0) {
			this.modal.setTitle("No duplicate definitions");
			contentEl.createEl("p", {
				text: "Every definition phrase and alias resolves to a unique key.",
			});
			this.modal.open();
			return;
		}

		this.modal.setTitle("Duplicate Definitions");

		contentEl.createEl("p", {
			cls: "definition-duplicates-hint",
			text: `${duplicates.length} duplicate definition${duplicates.length === 1 ? "" : "s"} found!`,
		});
		contentEl.createEl("p", {
			cls: "definition-duplicates-hint",
			text: "Note: When case-sensitivity is disabled, terms that differ only in case are treated as conflicts.",
		});

		duplicates.forEach((dup) => this.renderDuplicate(contentEl, dup));
		this.modal.open();
	}

	private renderDuplicate(container: HTMLElement, dup: DuplicateDefinition) {
		const section = container.createDiv({
			cls: "definition-duplicate-group",
		});
		section.createEl("div", {
			cls: "definition-duplicate-term",
			text: dup.key,
		});

		const firstPath = dup.occurrences[0].filePath;
		const sameFile = dup.occurrences.every(
			(occ) => occ.filePath === firstPath,
		);
		section.createEl("div", {
			cls: "definition-duplicate-scope",
			text: sameFile
				? "Duplicated within the same file"
				: "Declared across multiple files",
		});

		const list = section.createEl("ul", {
			cls: "definition-duplicate-list",
		});
		dup.occurrences.forEach((occ) => {
			const item = list.createEl("li");
			const roleLabel = occ.role === "phrase" ? "Phrase" : "Alias";
			const lineLabel =
				occ.position != null ? ` (line ${occ.position.from + 1})` : "";
			const link = item.createEl("a", {
				cls: "definition-duplicate-link",
				text: `${roleLabel} "${occ.text}" — ${occ.filePath}${lineLabel}`,
			});
			link.addEventListener("click", (e) => {
				e.preventDefault();
				this.modal.close();
				this.app.workspace.openLinkText(occ.linkText, "");
			});
		});
	}
}
