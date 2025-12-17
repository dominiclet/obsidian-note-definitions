import { Menu, Modal, Notice, Plugin, TFolder, WorkspaceWindow, TFile, MarkdownView } from 'obsidian';
import { injectGlobals } from './globals';
import { logDebug } from './util/log';
import { definitionMarker } from './editor/decoration';
import { Extension } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { DefManager, initDefFileManager } from './core/def-file-manager';
import { Definition } from './core/model';
import { getDefinitionPopover, initDefinitionPopover } from './editor/definition-popover';
import { postProcessor } from './editor/md-postprocessor';
import { DEFAULT_SETTINGS, getSettings, SettingsTab } from './settings';
import { getMarkedWordUnderCursor } from './util/editor';
import { FileExplorerDecoration, initFileExplorerDecoration } from './ui/file-explorer';
import { EditDefinitionModal } from './editor/edit-modal';
import { AddDefinitionModal } from './editor/add-modal';
import { initDefinitionModal } from './editor/mobile/definition-modal';
import { FMSuggestModal } from './editor/frontmatter-suggest-modal';
import { registerDefFile } from './editor/def-file-registration';
import { DefFileType } from './core/file-type';

export default class NoteDefinition extends Plugin {
	activeEditorExtensions: Extension[] = [];
	defManager: DefManager;
	fileExplorerDeco: FileExplorerDecoration;

	async onload() {
		// Settings are injected into global object
		const settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData())
		injectGlobals(settings, this.app, window);

		// Store plugin reference globally
		window.NoteDefinition.plugin = this;

		this.registerEvent(this.app.workspace.on('window-open', (win: WorkspaceWindow, newWindow: Window) => {
			injectGlobals(settings, this.app, newWindow);
			newWindow.NoteDefinition.plugin = this;
		}))

		logDebug("Load note definition plugin");

		initDefinitionPopover(this);
		initDefinitionModal(this.app);
		this.defManager = initDefFileManager(this.app);
		this.fileExplorerDeco = initFileExplorerDecoration(this.app);
		this.registerEditorExtension(this.activeEditorExtensions);
		this.updateEditorExts();

		this.registerCommands();
		this.registerEvents();

		this.addSettingTab(new SettingsTab(this.app, this, this.saveSettings.bind(this)));
		this.registerMarkdownPostProcessor(postProcessor);

		this.fileExplorerDeco.run();
	}

	async saveSettings() {
		await this.saveData(window.NoteDefinition.settings);
		this.fileExplorerDeco.run();
		this.refreshDefinitions();
	}

	registerCommands() {
		this.addCommand({
			id: "preview-definition",
			name: "Preview definition",
			editorCallback: (editor) => {
				const curWord = getMarkedWordUnderCursor(editor);
				if (!curWord) return;
				const def = window.NoteDefinition.definitions.global.get(curWord);
				if (!def) return;
				getDefinitionPopover().openAtCursor(def);
			}
		});

		this.addCommand({
			id: "goto-definition",
			name: "Go to definition",
			editorCallback: (editor) => {
				const currWord = getMarkedWordUnderCursor(editor);
				if (!currWord) return;
				const def = this.defManager.get(currWord);
				if (!def) return;
				this.app.workspace.openLinkText(def.linkText, '');
			}
		});

		this.addCommand({
			id: "add-definition",
			name: "Add definition",
			editorCallback: (editor) => {
				const selectedText = editor.getSelection();
				const addModal = new AddDefinitionModal(this.app);
				addModal.open(selectedText);
			}
		});

		this.addCommand({
			id: "add-def-context",
			name: "Add definition context",
			editorCallback: (editor) => {
				const activeFile = this.app.workspace.getActiveFile();
				if (!activeFile) {
					new Notice("Command must be used within an active opened file");
					return;
				}
				const suggestModal = new FMSuggestModal(this.app, activeFile);
				suggestModal.open();
			}
		});

		this.addCommand({
			id: "refresh-definitions",
			name: "Refresh definitions",
			callback: () => {
				this.fileExplorerDeco.run();
				this.defManager.loadDefinitions();
			}
		});

		this.addCommand({
			id: "register-consolidated-def-file",
			name: "Register consolidated definition file",
			editorCallback: (_) => {
				const activeFile = this.app.workspace.getActiveFile();
				if (!activeFile) {
					new Notice("Command must be used within an active opened file");
					return;
				}
				registerDefFile(this.app, activeFile, DefFileType.Consolidated);
			}
		});

		this.addCommand({
			id: "register-atomic-def-file",
			name: "Register atomic definition file",
			editorCallback: (_) => {
				const activeFile = this.app.workspace.getActiveFile();
				if (!activeFile) {
					new Notice("Command must be used within an active opened file");
					return;
				}
				registerDefFile(this.app, activeFile, DefFileType.Atomic);
			}
		});

		this.addCommand({
			id: "generate-math-translation-dashboard",
			name: "Generate Math Translation Dashboard",
			callback: async () => {
				await this.generateMathDashboard();
			}
		});

		this.addCommand({
			id: "generate-theory-integration-dashboard",
			name: "Generate Theory Integration Dashboard",
			callback: async () => {
				await this.generateTheoryDashboard();
			}
		});

		this.addCommand({
			id: "create-definition-from-template",
			name: "Create Definition from Template",
			callback: async () => {
				await this.createDefinitionFromTemplate();
			}
		});
	}

	registerEvents() {
		this.registerEvent(this.app.workspace.on("active-leaf-change", async (leaf) => {
			if (!leaf) return;
			this.reloadUpdatedDefinitions();
			this.updateEditorExts();
			this.defManager.updateActiveFile();
		}));

		this.registerEvent(this.app.workspace.on("editor-menu", (menu, editor) => {
			const defPopover = getDefinitionPopover();
			if (defPopover) {
				defPopover.close();
			}

			const curWord = getMarkedWordUnderCursor(editor);
			if (!curWord) {
				if (editor.getSelection()) {
					menu.addItem(item => {
						item.setTitle("Add definition")
						item.setIcon("plus")
						.onClick(() => {
								const addModal = new AddDefinitionModal(this.app);
								addModal.open(editor.getSelection());
						});
					});
				}
				return;
			};
			const def = this.defManager.get(curWord);
			if (!def) {
				return;
			};
			this.registerMenuForMarkedWords(menu, def);
		}));

		// Add file menu options
		this.registerEvent(this.app.workspace.on("file-menu", (menu, file, source) => {
			if (file instanceof TFolder) {
				menu.addItem(item => {
					item.setTitle("Set definition folder")
						.setIcon("book-a")
						.onClick(() => {
							const settings = getSettings();
							settings.defFolder = file.path;
							this.saveSettings();
						});
				});
			}
		}));

		// Creating files under def folder should register file as definition file
		this.registerEvent(this.app.vault.on('create', (file) => {
			const settings = getSettings();
			if (file.path.startsWith(settings.defFolder)) {
				this.fileExplorerDeco.run();
				this.refreshDefinitions();
			}
		}));

		this.registerEvent(this.app.metadataCache.on('changed', (file: TFile) => {
			const currFile = this.app.workspace.getActiveFile();
			
			if (currFile && currFile.path === file.path) {
				this.defManager.updateActiveFile();

				let activeView = this.app.workspace.getActiveViewOfType(MarkdownView);

				if(activeView) {
					// @ts-expect-error, not typed
					const view = activeView.editor.cm as EditorView;
					const plugin = view.plugin(definitionMarker);
					
					if (plugin) {
						plugin.forceUpdate();
					}
				}
			}
		}));
	}

	registerMenuForMarkedWords(menu: Menu, def: Definition) {
		menu.addItem((item) => {
			item.setTitle("Go to definition")
				.setIcon("arrow-left-from-line")
				.onClick(() => {
					this.app.workspace.openLinkText(def.linkText, '');
				});
		})

		menu.addItem(item => {
			item.setTitle("Edit definition")
				.setIcon("pencil")
				.onClick(() => {
					const editModal = new EditDefinitionModal(this.app);
					editModal.open(def);
				});
		});

		// Add menu item to mark/unmark word as known
		const settings = getSettings();
		const isKnown = settings.knownWords && settings.knownWords.includes(def.key);

		menu.addItem(item => {
			if (isKnown) {
				item.setTitle("Mark as unknown")
					.setIcon("eye")
					.onClick(async () => {
						const index = settings.knownWords.indexOf(def.key);
						if (index > -1) {
							settings.knownWords.splice(index, 1);
							await this.saveSettings();
							new Notice(`"${def.word}" will now be highlighted again`);
							// Force decoration update
							this.forceDecorationUpdate();
						}
					});
			} else {
				item.setTitle("Mark as known")
					.setIcon("eye-off")
					.onClick(async () => {
						if (!settings.knownWords) {
							settings.knownWords = [];
						}
						settings.knownWords.push(def.key);
						await this.saveSettings();
						new Notice(`"${def.word}" marked as known and will no longer be highlighted`);
						// Force decoration update
						this.forceDecorationUpdate();
					});
			}
		});
	}

	forceDecorationUpdate() {
		let activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
		if(activeView) {
			// @ts-expect-error, not typed
			const view = activeView.editor.cm as EditorView;
			const plugin = view.plugin(definitionMarker);

			if (plugin) {
				plugin.forceUpdate();
			}
		}
	}

	refreshDefinitions() {
		this.defManager.loadDefinitions();
	}

	reloadUpdatedDefinitions() {
		this.defManager.loadUpdatedFiles();
	}

	updateEditorExts() {
		const currFile = this.app.workspace.getActiveFile();
		if (currFile && this.defManager.isDefFile(currFile)) {
			// TODO: Editor extension for definition file
			this.setActiveEditorExtensions([]);
		} else {
			this.setActiveEditorExtensions(definitionMarker);
		}
	}

	private setActiveEditorExtensions(...ext: Extension[]) {
		this.activeEditorExtensions.length = 0;
		this.activeEditorExtensions.push(...ext);
		this.app.workspace.updateOptions();
	}

	// ==============================================================
	// MATH TRANSLATION DASHBOARD
	// ==============================================================
	async generateMathDashboard() {
		new Notice("Generating Math Translation Dashboard...");

		const files = this.app.vault.getMarkdownFiles();
		const mathSymbols: Record<string, { count: number; meanings: Set<string>; files: Set<string> }> = {};

		// Common mathematical symbols to track
		const symbolsToTrack = [
			'χ', 'ψ', 'Ψ', 'φ', 'Φ', 'θ', 'Θ', 'λ', 'Λ', 'μ', 'ν', 'ρ', 'σ', 'Σ', 'τ', 'ω', 'Ω',
			'α', 'β', 'γ', 'Γ', 'δ', 'Δ', 'ε', 'ζ', 'η', 'κ', 'π', 'ξ', 'Ξ',
			'∇', '∂', '∫', '∑', '∏', '√', '∞', '≈', '≠', '≤', '≥', '±', '∈', '∉', '⊂', '⊃', '∪', '∩',
			'ℏ', 'ℝ', 'ℂ', 'ℕ', 'ℤ', 'ℚ'
		];

		let totalEquations = 0;
		let filesWithMath = 0;

		for (const file of files) {
			const content = await this.app.vault.read(file);
			let fileHasMath = false;

			// Count equations ($$...$$, $...$, ```math)
			const displayMath = content.match(/\$\$[\s\S]*?\$\$/g);
			const inlineMath = content.match(/\$[^\$\n]+\$/g);
			const mathBlocks = content.match(/```math[\s\S]*?```/g);

			const equationCount = (displayMath?.length || 0) + (inlineMath?.length || 0) + (mathBlocks?.length || 0);
			if (equationCount > 0) {
				totalEquations += equationCount;
				filesWithMath++;
				fileHasMath = true;
			}

			// Track symbols
			symbolsToTrack.forEach(symbol => {
				if (content.includes(symbol)) {
					if (!mathSymbols[symbol]) {
						mathSymbols[symbol] = { count: 0, meanings: new Set(), files: new Set() };
					}

					// Count occurrences
					const regex = new RegExp(symbol.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g');
					const matches = content.match(regex);
					mathSymbols[symbol].count += matches?.length || 0;
					mathSymbols[symbol].files.add(file.basename);

					// Try to extract meaning from definition context
					const defMatch = content.match(new RegExp(`${symbol}\\s*[=:]\\s*([^\\n.]{3,50})`));
					if (defMatch) {
						mathSymbols[symbol].meanings.add(defMatch[1].trim());
					}
				}
			});
		}

		// Sort by frequency
		const sortedSymbols = Object.entries(mathSymbols).sort(([,a], [,b]) => b.count - a.count);

		// Generate Markdown
		let md = `---
cssclass: dashboard
tags: [dashboard, math, symbols]
updated: ${new Date().toLocaleString()}
---

# 🔣 Math Translation Dashboard

> **Rosetta Stone for Mathematical Language**

## 📊 Overview

| Metric | Value |
|--------|-------|
| **Total Equations** | ${totalEquations} |
| **Files with Math** | ${filesWithMath} / ${files.length} |
| **Unique Symbols** | ${sortedSymbols.length} |
| **Symbol Occurrences** | ${sortedSymbols.reduce((sum, [,data]) => sum + data.count, 0)} |

---

## 📖 Symbol Dictionary

| Symbol | Frequency | Meanings Found | Files |
|:------:|:---------:|:---------------|:------|
`;

		sortedSymbols.slice(0, 50).forEach(([symbol, data]) => {
			const meanings = Array.from(data.meanings).slice(0, 3).join('; ') || '_undefined_';
			const fileCount = data.files.size;
			md += `| **${symbol}** | ${data.count} | ${meanings} | ${fileCount} |\n`;
		});

		if (sortedSymbols.length > 50) {
			md += `\n_...and ${sortedSymbols.length - 50} more symbols._\n`;
		}

		md += `\n---\n\n## 🔍 Missing Definitions\n\n`;
		const undefinedSymbols = sortedSymbols.filter(([, data]) => data.meanings.size === 0);
		if (undefinedSymbols.length > 0) {
			md += `> These symbols appear but lack clear definitions:\n\n`;
			undefinedSymbols.slice(0, 20).forEach(([symbol, data]) => {
				md += `- **${symbol}** (${data.count} occurrences across ${data.files.size} files)\n`;
			});
		} else {
			md += `✅ **All tracked symbols have definitions!**\n`;
		}

		// Save dashboard
		await this.saveDashboard('MATH_TRANSLATION_DASHBOARD.md', md);
	}

	// ==============================================================
	// THEORY INTEGRATION DASHBOARD
	// ==============================================================
	async generateTheoryDashboard() {
		new Notice("Generating Theory Integration Dashboard...");

		const files = this.app.vault.getMarkdownFiles();
		const theoryCounts: Record<string, { count: number; files: Set<string> }> = {};

		// Comprehensive theory list
		const knownTheories = [
			// Physics
			"General Relativity", "Special Relativity", "Quantum Mechanics", "Quantum Field Theory",
			"Standard Model", "String Theory", "M-Theory", "Loop Quantum Gravity",
			"Thermodynamics", "Statistical Mechanics", "Classical Mechanics", "Electromagnetism",
			"Holographic Principle", "AdS/CFT", "Black Hole Thermodynamics",

			// Quantum Interpretations
			"Copenhagen Interpretation", "Many-Worlds Interpretation", "Pilot Wave Theory",
			"Objective Collapse", "Relational Quantum Mechanics",

			// Cosmology
			"Big Bang", "Inflation", "Lambda-CDM", "Cosmic Microwave Background",
			"Dark Matter", "Dark Energy", "Multiverse",

			// Information & Computation
			"Information Theory", "Shannon Entropy", "Kolmogorov Complexity",
			"Computational Theory", "Turing Completeness", "Church-Turing Thesis",
			"Landauer's Principle", "Bekenstein Bound",

			// Consciousness & Mind
			"Integrated Information Theory", "Global Workspace Theory", "Orch-OR",
			"Predictive Processing", "Free Energy Principle", "Higher-Order Thought",

			// Mathematics
			"Set Theory", "Category Theory", "Type Theory", "Topos Theory",
			"Group Theory", "Topology", "Differential Geometry", "Algebraic Geometry",

			// Philosophy & Logic
			"Modal Logic", "Predicate Logic", "Gödel's Incompleteness", "Tarski's Undefinability",
			"Bayesian Inference", "Occam's Razor", "Fine-Tuning Argument",

			// Theology
			"Nicene Creed", "Chalcedonian Definition", "Trinitarianism", "Christology",
			"Pneumatology", "Soteriology", "Eschatology", "Logos Theology",
			"Imago Dei", "Divine Simplicity", "Classical Theism", "Panentheism",

			// Systems & Complexity
			"Cybernetics", "Systems Theory", "Complexity Theory", "Chaos Theory",
			"Emergence", "Self-Organization", "Autopoiesis", "Dissipative Structures"
		];

		// Scan all files
		for (const file of files) {
			const content = await this.app.vault.read(file);

			knownTheories.forEach(theory => {
				const regex = new RegExp(`\\b${theory.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi');
				const matches = content.match(regex);

				if (matches) {
					if (!theoryCounts[theory]) {
						theoryCounts[theory] = { count: 0, files: new Set() };
					}
					theoryCounts[theory].count += matches.length;
					theoryCounts[theory].files.add(file.basename);
				}
			});
		}

		// Sort by count
		const sortedTheories = Object.entries(theoryCounts)
			.sort(([,a], [,b]) => b.count - a.count);

		// Calculate integration metrics
		const totalReferences = sortedTheories.reduce((sum, [,data]) => sum + data.count, 0);
		const theoriesFound = sortedTheories.length;

		// Generate Markdown
		let md = `---
cssclass: dashboard
tags: [dashboard, theories, integration]
updated: ${new Date().toLocaleString()}
---

# 📚 Theory Integration Dashboard

> **Mapping the Conceptual Landscape**

## 📊 Integration Metrics

| Metric | Value |
|--------|-------|
| **Frameworks Integrated** | ${theoriesFound} / ${knownTheories.length} |
| **Total References** | ${totalReferences} |
| **Integration Density** | ${(totalReferences / files.length).toFixed(2)} refs/file |
| **Coverage** | ${((theoriesFound / knownTheories.length) * 100).toFixed(1)}% |

---

## 🏆 Top Integrations

| Rank | Theory/Framework | References | Files | Status |
|:----:|:-----------------|:----------:|:-----:|:-------|
`;

		sortedTheories.slice(0, 30).forEach(([theory, data], index) => {
			const status = data.count > 50 ? "🟢 Core" : data.count > 10 ? "🟡 Referenced" : "⚪ Mentioned";
			md += `| ${index + 1} | **${theory}** | ${data.count} | ${data.files.size} | ${status} |\n`;
		});

		if (sortedTheories.length > 30) {
			md += `\n_...and ${sortedTheories.length - 30} more frameworks._\n`;
		}

		md += `\n---\n\n## 🔍 Missing Integrations\n\n`;
		const missingTheories = knownTheories.filter(t => !theoryCounts[t]);
		if (missingTheories.length > 0) {
			md += `> These frameworks haven't been explicitly referenced yet:\n\n`;
			const categories = {
				'Physics': missingTheories.filter(t =>
					['Relativity', 'Quantum', 'String', 'Loop', 'Field', 'Mechanics', 'Electro', 'Thermo', 'Holo'].some(k => t.includes(k))
				),
				'Theology': missingTheories.filter(t =>
					['Creed', 'Christ', 'Trinity', 'Logos', 'Pneuma', 'Divine', 'Theism', 'Imago'].some(k => t.includes(k))
				),
				'Mathematics': missingTheories.filter(t =>
					['Theory', 'Geometry', 'Topology', 'Group', 'Category', 'Type'].some(k => t.includes(k))
				),
				'Consciousness': missingTheories.filter(t =>
					['Consciousness', 'IIT', 'Workspace', 'Orch', 'Predict', 'Free Energy'].some(k => t.includes(k))
				)
			};

			Object.entries(categories).forEach(([cat, theories]) => {
				if (theories.length > 0) {
					md += `\n### ${cat}\n`;
					theories.forEach(t => md += `- [ ] ${t}\n`);
				}
			});
		} else {
			md += `✅ **All tracked frameworks have been integrated!**\n`;
		}

		// Save dashboard
		await this.saveDashboard('THEORY_INTEGRATION_DASHBOARD.md', md);
	}

	// ==============================================================
	// HELPER: Save Dashboard
	// ==============================================================
	async saveDashboard(filename: string, content: string) {
		const settings = getSettings();
		const defFolder = settings.defFolder || 'definitions';
		const dashboardPath = `${defFolder}/${filename}`;

		try {
			const existingFile = this.app.vault.getAbstractFileByPath(dashboardPath);

			if (existingFile instanceof TFile) {
				await this.app.vault.modify(existingFile, content);
				new Notice(`Updated: ${filename}`);
			} else {
				await this.app.vault.create(dashboardPath, content);
				new Notice(`Created: ${filename}`);
			}

			// Open the dashboard
			const file = this.app.vault.getAbstractFileByPath(dashboardPath);
			if (file instanceof TFile) {
				const leaf = this.app.workspace.getLeaf(false);
				await leaf.openFile(file);
			}
		} catch (error) {
			new Notice(`Error creating dashboard: ${error}`);
			console.error(error);
		}
	}

	// ==============================================================
	// DEFINITION TEMPLATES
	// ==============================================================
	async createDefinitionFromTemplate() {
		const settings = getSettings();
		const defFolder = settings.defFolder || 'definitions';

		// Check if template exists
		const templatePath = `${defFolder}/_template.md`;
		const templateFile = this.app.vault.getAbstractFileByPath(templatePath);

		let template = `---
display-mode: all-occurrences
highlight-style: underline
---

# [Term Name]

*[Aliases: synonym1, synonym2]*

## Definition
[Core definition goes here]

## Context
[Where this term is used, related concepts]

## Examples
- Example 1
- Example 2

## References
- [[Related Term 1]]
- [[Related Term 2]]
`;

		// If template exists, use it
		if (templateFile instanceof TFile) {
			template = await this.app.vault.read(templateFile);
		} else {
			// Create default template for future use
			try {
				await this.app.vault.create(templatePath, template);
				new Notice("Created default template at " + templatePath);
			} catch (e) {
				// Template creation failed, continue anyway
			}
		}

		// Prompt for term name
		const termName = await this.promptForInput("Enter term name:");
		if (!termName) return;

		// Replace placeholders
		const finalContent = template
			.replace(/\[Term Name\]/g, termName)
			.replace(/\[Aliases:.*?\]/g, `Aliases: ${termName.toLowerCase()}`);

		// Create new definition file
		const newFilePath = `${defFolder}/${termName}.md`;
		try {
			const newFile = await this.app.vault.create(newFilePath, finalContent);
			new Notice(`Created definition: ${termName}`);

			// Open the file
			const leaf = this.app.workspace.getLeaf(false);
			await leaf.openFile(newFile);
		} catch (error) {
			new Notice(`Error creating definition: ${error}`);
		}
	}

	async promptForInput(message: string): Promise<string | null> {
		return new Promise((resolve) => {
			const modal = new Modal(this.app);
			modal.titleEl.setText(message);

			const input = modal.contentEl.createEl("input", {
				type: "text",
				attr: { style: "width: 100%; padding: 8px; margin: 10px 0;" }
			});

			const buttonContainer = modal.contentEl.createDiv({ attr: { style: "display: flex; gap: 8px; justify-content: flex-end;" }});

			const cancelBtn = buttonContainer.createEl("button", { text: "Cancel" });
			cancelBtn.onclick = () => {
				modal.close();
				resolve(null);
			};

			const confirmBtn = buttonContainer.createEl("button", { text: "Create", cls: "mod-cta" });
			confirmBtn.onclick = () => {
				modal.close();
				resolve(input.value);
			};

			input.addEventListener("keypress", (e) => {
				if (e.key === "Enter") {
					modal.close();
					resolve(input.value);
				}
			});

			modal.open();
			input.focus();
		});
	}

	onunload() {
		logDebug("Unload note definition plugin");
		getDefinitionPopover().cleanUp();
	}
}
