import { App, Component, MarkdownRenderer, MarkdownView, normalizePath, Plugin } from "obsidian";
import { Definition } from "src/core/model";
import { getSettings, PopoverDismissType, PopoverDisplayMode } from "src/settings";
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

	// Extract internal links from definition content
	private extractOutboundLinks(definition: string): { text: string; link: string }[] {
		const linkRegex = /\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g;
		const links: { text: string; link: string }[] = [];
		let match;

		while ((match = linkRegex.exec(definition)) !== null) {
			const link = match[1];
			const text = match[2] || match[1];
			// Avoid duplicates
			if (!links.some(l => l.link === link)) {
				links.push({ text, link });
			}
		}

		return links;
	}

	// Truncate definition to N lines
	private truncateToLines(definition: string, maxLines: number): { content: string; isTruncated: boolean } {
		if (maxLines <= 0) {
			return { content: definition, isTruncated: false };
		}
		const lines = definition.split('\n');
		if (lines.length <= maxLines) {
			return { content: definition, isTruncated: false };
		}
		return {
			content: lines.slice(0, maxLines).join('\n'),
			isTruncated: true
		};
	}

	// Get backlinks count for a definition file
	private getBacklinksCount(def: Definition): number {
		// Use the resolvedLinks from metadataCache to find files linking to this definition
		const resolvedLinks = this.app.metadataCache.resolvedLinks;
		let count = 0;

		for (const sourcePath in resolvedLinks) {
			if (sourcePath === def.file.path) continue;
			const links = resolvedLinks[sourcePath];
			if (links && def.file.path in links) {
				count++;
			}
		}
		return count;
	}

	// Creates popover element and its children, without displaying it
	private createElement(def: Definition, parent: HTMLElement): HTMLDivElement {
		const popoverSettings = getSettings().defPopoverConfig;
		const isMinimalMode = popoverSettings.displayMode === PopoverDisplayMode.Minimal;

		const el = parent.createEl("div", {
			cls: "definition-popover",
			attr: {
				id: DEF_POPOVER_ID,
				style: `visibility:hidden;${popoverSettings.backgroundColour ?
`background-color: ${popoverSettings.backgroundColour};` : ''}`
			},
		});

		el.createEl("h2", { text: def.word });

		if (def.aliases.length > 0 && popoverSettings.displayAliases) {
			el.createEl("i", { text: def.aliases.join(", ") });
		}

		if (isMinimalMode) {
			// Minimal mode: show only outbound links
			if (popoverSettings.showOutboundLinks) {
				const outboundLinks = this.extractOutboundLinks(def.definition);
				if (outboundLinks.length > 0) {
					const linksContainer = el.createEl("div", { cls: "definition-popover-links" });
					linksContainer.createEl("div", {
						text: "Related:",
						cls: "definition-popover-links-header"
					});
					const linksList = linksContainer.createEl("ul", { cls: "definition-popover-links-list" });

					for (const linkInfo of outboundLinks) {
						const li = linksList.createEl("li");
						const linkEl = li.createEl("a", {
							text: linkInfo.text,
							cls: "internal-link definition-popover-link",
							attr: { href: linkInfo.link }
						});
						linkEl.addEventListener('click', e => {
							e.preventDefault();
							const file = this.app.metadataCache.getFirstLinkpathDest(
								linkInfo.link,
								normalizePath(def.file.path)
							);
							this.unmount();
							if (!file) return;
							this.app.workspace.getLeaf().openFile(file);
						});
					}
				}
			}

			// Add "View full definition" link
			const viewFullEl = el.createEl("div", { cls: "definition-popover-view-full" });
			const viewFullLink = viewFullEl.createEl("a", {
				text: "View full definition →",
				cls: "internal-link"
			});
			viewFullLink.addEventListener('click', e => {
				e.preventDefault();
				this.unmount();
				this.app.workspace.openLinkText(def.linkText, '');
			});
		} else {
			// Full mode: show complete definition content
			const contentEl = el.createEl("div");
			contentEl.setAttr("ctx", "def-popup");

			// Apply preview line limit if configured
			const previewLimit = popoverSettings.previewLineLimit ?? 0;
			const { content: displayContent, isTruncated } = this.truncateToLines(def.definition, previewLimit);

			const currComponent = this;
			MarkdownRenderer.render(this.app, displayContent, contentEl,
				normalizePath(def.file.path), currComponent);
			this.postprocessMarkdown(contentEl, def);

			// Add "Read more..." link if truncated
			if (isTruncated) {
				const readMoreEl = el.createEl("div", { cls: "definition-popover-read-more" });
				const readMoreLink = readMoreEl.createEl("a", {
					text: "Read more...",
					cls: "internal-link"
				});
				readMoreLink.addEventListener('click', e => {
					e.preventDefault();
					this.unmount();
					this.app.workspace.openLinkText(def.linkText, '');
				});
			}

			// Show outbound links section if enabled (even in full mode)
			if (popoverSettings.showOutboundLinks) {
				const outboundLinks = this.extractOutboundLinks(def.definition);
				if (outboundLinks.length > 0) {
					const linksContainer = el.createEl("div", { cls: "definition-popover-links" });
					linksContainer.createEl("div", {
						text: "Related notes:",
						cls: "definition-popover-links-header"
					});
					const linksEl = linksContainer.createEl("div", { cls: "definition-popover-links-inline" });

					outboundLinks.forEach((linkInfo, index) => {
						if (index > 0) {
							linksEl.createSpan({ text: " · " });
						}
						const linkEl = linksEl.createEl("a", {
							text: linkInfo.text,
							cls: "internal-link definition-popover-link",
							attr: { href: linkInfo.link }
						});
						linkEl.addEventListener('click', e => {
							e.preventDefault();
							const file = this.app.metadataCache.getFirstLinkpathDest(
								linkInfo.link,
								normalizePath(def.file.path)
							);
							this.unmount();
							if (!file) return;
							this.app.workspace.getLeaf().openFile(file);
						});
					});
				}
			}
		}

		// Show backlinks count if enabled
		if (popoverSettings.showBacklinksCount) {
			const backlinksCount = this.getBacklinksCount(def);
			if (backlinksCount > 0) {
				el.createEl("div", {
					text: `Referenced by ${backlinksCount} note${backlinksCount > 1 ? 's' : ''}`,
					cls: "definition-popover-backlinks"
				});
			}
		}

		// Show quick actions if enabled
		if (popoverSettings.showQuickActions) {
			const actionsEl = el.createEl("div", { cls: "definition-popover-actions" });

			const editBtn = actionsEl.createEl("button", {
				text: "Edit",
				cls: "definition-popover-action-btn"
			});
			editBtn.addEventListener('click', e => {
				e.preventDefault();
				e.stopPropagation();
				this.unmount();
				// Open the edit modal
				const { EditDefinitionModal } = require('./edit-modal');
				const editModal = new EditDefinitionModal(this.app);
				editModal.open(def);
			});

			const openBtn = actionsEl.createEl("button", {
				text: "Open",
				cls: "definition-popover-action-btn"
			});
			openBtn.addEventListener('click', e => {
				e.preventDefault();
				e.stopPropagation();
				this.unmount();
				this.app.workspace.openLinkText(def.linkText, '');
			});

			const newPaneBtn = actionsEl.createEl("button", {
				text: "New pane",
				cls: "definition-popover-action-btn"
			});
			newPaneBtn.addEventListener('click', e => {
				e.preventDefault();
				e.stopPropagation();
				this.unmount();
				this.app.workspace.getLeaf('split').openFile(def.file);
			});
		}

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

	// Offset coordinates from viewport coordinates to coordinates relative to the parent container element
	private offsetCoordsToContainer(coords: Coordinates, container: HTMLElement): Coordinates {
		const containerRect = container.getBoundingClientRect();
		return {
			left: coords.left - containerRect.left,
			right: coords.right - containerRect.left,
			top: coords.top - containerRect.top,
			bottom: coords.bottom - containerRect.top
		}
	}

	private mountAtCoordinates(def: Definition, coords: Coordinates) {
		const mdView = this.app.workspace.getActiveViewOfType(MarkdownView)
		if (!mdView) {
			logError("Could not mount popover: No active markdown view found");
			return;
		}

		this.mountedPopover = this.createElement(def, mdView.containerEl);
		this.positionAndSizePopover(mdView, coords);
	}

	// Position and display popover
	private positionAndSizePopover(mdView: MarkdownView, coords: Coordinates) {
		if (!this.mountedPopover) {
			return;
		}
		const popoverSettings = getSettings().defPopoverConfig;
		const containerStyle = getComputedStyle(mdView.containerEl);
		const matchedClasses = mdView.containerEl.getElementsByClassName("view-header");
		// The container div has a header element that needs to be accounted for
		let offsetHeaderHeight = 0;
		if (matchedClasses.length > 0) {
			offsetHeaderHeight = parseInt(getComputedStyle(matchedClasses[0]).height);
		}

		// Offset coordinates to be relative to container
		coords = this.offsetCoordsToContainer(coords, mdView.containerEl);

		const positionStyle: Partial<CSSStyleDeclaration> = {
			visibility: 'visible',
		};

		positionStyle.maxWidth = popoverSettings.enableCustomSize && popoverSettings.maxWidth ? 
			`${popoverSettings.maxWidth}px` : `${parseInt(containerStyle.width) / 2}px`;
		if (this.shouldOpenToLeft(coords.left, containerStyle)) {
			positionStyle.right = `${parseInt(containerStyle.width) - coords.right}px`;
		} else {
			positionStyle.left = `${coords.left}px`;
		}

		if (this.shouldOpenUpwards(coords.top, containerStyle)) {
			positionStyle.bottom = `${parseInt(containerStyle.height) - coords.top}px`;
			positionStyle.maxHeight = popoverSettings.enableCustomSize && popoverSettings.maxHeight ? 
				`${popoverSettings.maxHeight}px` : `${coords.top - offsetHeaderHeight}px`;
		} else {
			positionStyle.top = `${coords.bottom}px`;
			positionStyle.maxHeight = popoverSettings.enableCustomSize && popoverSettings.maxHeight ?
				`${popoverSettings.maxHeight}px` : `${parseInt(containerStyle.height) - coords.bottom}px`;
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
		this.getActiveView()?.containerEl.addEventListener("keypress", this.close);
		this.getActiveView()?.containerEl.addEventListener("click", this.clickClose);
		
		if (this.mountedPopover) {
			this.mountedPopover.addEventListener("mouseleave", () => {
				const popoverSettings = getSettings().defPopoverConfig;
				if (popoverSettings.popoverDismissEvent === PopoverDismissType.MouseExit) {
					this.clickClose();
				}
			});
		}
		if (this.cmEditor) {
			this.cmEditor.on("vim-keypress", this.close);
		}
		const scroller = this.getCmScroller();
		if (scroller) {
			scroller.addEventListener("scroll", this.close);
		}
	}

	private unregisterClosePopoverListeners() {
		this.getActiveView()?.containerEl.removeEventListener("keypress", this.close);
		this.getActiveView()?.containerEl.removeEventListener("click", this.clickClose);

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

	private getActiveView() {
		return this.app.workspace.getActiveViewOfType(MarkdownView);
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
