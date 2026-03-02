import { App, ItemView, Modal, WorkspaceLeaf, TFile, MarkdownView, Notice } from 'obsidian';
import FountainPlugin from './main';

export const FOUNTAIN_PREVIEW_VIEW = 'fountain-preview-view';

// Fountain regex patterns (same as CM6 but used for HTML rendering)
const regexPatterns = {
    sceneHeading: /^(?:INT\.|EXT\.|EST\.|INT\/EXT\.|I\/E\.|I\/X\.).*|^\.[^.].*$/i,
    transition: /^(?:[A-Z\s]+TO:|FADE TO BLACK\.|FADE OUT\.|CUT TO BLACK\.|>.*[^<])$/i,
    centered: /^>\s*.*\s*<$/,
    character: /^[\s]*[A-Z0-9\s]+(?: \([^)]+\))?\s*(?:\^)?$/,
    parenthetical: /^\s*\([^)]+\)\s*$/,
};

interface FountainLine {
    type: string;
    text: string;
    rawText: string;
}

/**
 * Parse Fountain text into an array of typed line objects.
 */
function parseFountain(text: string): FountainLine[] {
    const rawLines = text.split('\n');
    const result: FountainLine[] = [];

    let lastLineWasCharacter = false;
    let lastLineWasParenthetical = false;
    let lastLineWasDialogue = false;
    let lastLineWasEmpty = true;

    for (const rawLine of rawLines) {
        const trimmed = rawLine.trim();

        if (trimmed === '') {
            // Fountain spec: a line with ONLY whitespace (e.g. two spaces)
            // inside a dialogue block continues the dialogue.
            // A truly empty line (length 0) breaks the dialogue.
            const isWhitespaceOnly = rawLine.length > 0;
            const inDialogueContext = lastLineWasCharacter || lastLineWasParenthetical || lastLineWasDialogue;

            if (isWhitespaceOnly && inDialogueContext) {
                // This is a dialogue continuation blank line
                result.push({ type: 'dialogue-blank', text: '', rawText: rawLine });
                // Don't reset dialogue state — dialogue continues after this
            } else {
                result.push({ type: 'empty', text: '', rawText: rawLine });
                lastLineWasEmpty = true;
                lastLineWasCharacter = false;
                lastLineWasParenthetical = false;
                lastLineWasDialogue = false;
            }
            continue;
        }

        let type = 'action';

        if (regexPatterns.sceneHeading.test(trimmed)) {
            type = 'scene-heading';
            lastLineWasCharacter = false;
            lastLineWasParenthetical = false;
            lastLineWasDialogue = false;
        } else if (regexPatterns.centered.test(trimmed)) {
            type = 'centered';
            lastLineWasCharacter = false;
            lastLineWasParenthetical = false;
            lastLineWasDialogue = false;
        } else if (/^#{1,6}\s/.test(trimmed)) {
            const levelMatch = trimmed.match(/^(#+)/);
            const level = Math.min(levelMatch ? levelMatch[1].length : 1, 3);
            type = `section-heading-${level}`;
            lastLineWasCharacter = false;
            lastLineWasParenthetical = false;
            lastLineWasDialogue = false;
        } else if (regexPatterns.transition.test(trimmed)) {
            type = 'transition';
            lastLineWasCharacter = false;
            lastLineWasParenthetical = false;
            lastLineWasDialogue = false;
        } else if (
            lastLineWasEmpty &&
            regexPatterns.character.test(rawLine) &&
            !regexPatterns.sceneHeading.test(trimmed) &&
            !regexPatterns.transition.test(trimmed)
        ) {
            type = 'character';
            lastLineWasCharacter = true;
            lastLineWasParenthetical = false;
            lastLineWasDialogue = false;
        } else if (
            // Dual-dialogue marker: CHARACTER ^ immediately after a dialogue block (no blank line required)
            (lastLineWasCharacter || lastLineWasParenthetical || lastLineWasDialogue) &&
            regexPatterns.character.test(rawLine) &&
            trimmed.endsWith('^') &&
            !regexPatterns.sceneHeading.test(trimmed) &&
            !regexPatterns.transition.test(trimmed)
        ) {
            type = 'character';
            lastLineWasCharacter = true;
            lastLineWasParenthetical = false;
            lastLineWasDialogue = false;
        } else if ((lastLineWasCharacter || lastLineWasParenthetical || lastLineWasDialogue) && regexPatterns.parenthetical.test(trimmed)) {
            type = 'parenthetical';
            lastLineWasCharacter = false;
            lastLineWasParenthetical = true;
            lastLineWasDialogue = false;
        } else if (lastLineWasCharacter || lastLineWasParenthetical || lastLineWasDialogue) {
            type = 'dialogue';
            lastLineWasCharacter = false;
            lastLineWasParenthetical = false;
            lastLineWasDialogue = true;
        } else {
            lastLineWasCharacter = false;
            lastLineWasParenthetical = false;
            lastLineWasDialogue = false;
        }

        lastLineWasEmpty = false;
        result.push({ type, text: trimmed, rawText: rawLine });
    }

    return result;
}

/**
 * Convert parsed Fountain lines into HTML, handling dual dialogue with flex containers.
 */
function fountainToHTML(lines: FountainLine[]): string {
    const htmlParts: string[] = [];
    let i = 0;

    while (i < lines.length) {
        const line = lines[i];

        // Check if this character line starts a dual dialogue block
        if (line.type === 'character') {
            // Look ahead to see if there's a dual dialogue marker
            const leftBlock = collectDialogueBlock(lines, i);
            const afterLeft = i + leftBlock.length;

            // Skip empty lines
            let cursor = afterLeft;
            while (cursor < lines.length && lines[cursor].type === 'empty') {
                cursor++;
            }

            // Check if the next character has a ^
            if (cursor < lines.length && lines[cursor].type === 'character' && lines[cursor].text.endsWith('^')) {
                const rightBlock = collectDialogueBlock(lines, cursor);

                // Render as dual dialogue flex container
                htmlParts.push('<div class="fountain-dual-dialogue">');

                // Left column
                htmlParts.push('<div class="fountain-dual-col">');
                for (const dl of leftBlock) {
                    htmlParts.push(renderLine(dl));
                }
                htmlParts.push('</div>');

                // Right column
                htmlParts.push('<div class="fountain-dual-col">');
                for (const dl of rightBlock) {
                    // Strip the ^ from the character name
                    if (dl.type === 'character') {
                        htmlParts.push(renderLine({ ...dl, text: dl.text.replace(/\s*\^\s*$/, '') }));
                    } else {
                        htmlParts.push(renderLine(dl));
                    }
                }
                htmlParts.push('</div>');

                htmlParts.push('</div>');

                i = cursor + rightBlock.length;
                continue;
            }
        }

        // Render normal line
        htmlParts.push(renderLine(line));
        i++;
    }

    return htmlParts.join('\n');
}

/**
 * Collect a dialogue block starting from a character line.
 * Returns [character, dialogue/parenthetical/dialogue-blank, ...]
 * A 'dialogue-blank' (whitespace-only line) continues the dialogue.
 */
function collectDialogueBlock(lines: FountainLine[], startIdx: number): FountainLine[] {
    const block: FountainLine[] = [];
    if (startIdx >= lines.length || lines[startIdx].type !== 'character') return block;

    block.push(lines[startIdx]);
    let j = startIdx + 1;
    while (j < lines.length && (lines[j].type === 'dialogue' || lines[j].type === 'parenthetical' || lines[j].type === 'dialogue-blank')) {
        block.push(lines[j]);
        j++;
    }
    return block;
}

/**
 * Render a single Fountain line to HTML.
 */
function renderLine(line: FountainLine): string {
    if (line.type === 'empty' || line.type === 'dialogue-blank') {
        return '<div class="fountain-empty">&nbsp;</div>';
    }

    let displayText = escapeHtml(line.text);

    // Strip Fountain markers for display
    if (line.type === 'centered') {
        displayText = escapeHtml(line.text.replace(/^>\s*/, '').replace(/\s*<$/, ''));
    } else if (line.type === 'transition') {
        displayText = escapeHtml(line.text.replace(/^>\s*/, ''));
    } else if (line.type.startsWith('section-heading')) {
        displayText = escapeHtml(line.text.replace(/^#+\s*/, ''));
    }

    return `<div class="fountain-line fountain-${line.type}">${displayText}</div>`;
}

function escapeHtml(text: string): string {
    return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

export class FountainPreviewView extends ItemView {
    plugin: FountainPlugin;
    private contentEl_inner: HTMLElement;
    private styleEl: HTMLStyleElement;
    private trackedFile: TFile | null = null; // Remember last file even when pane is focused
    private scrollSyncCleanup: (() => void) | null = null;

    constructor(leaf: WorkspaceLeaf, plugin: FountainPlugin) {
        super(leaf);
        this.plugin = plugin;
    }

    getViewType(): string {
        return FOUNTAIN_PREVIEW_VIEW;
    }

    getDisplayText(): string {
        return 'Fountain Preview';
    }

    getIcon(): string {
        return 'film';
    }

    async onOpen() {
        const container = this.containerEl.children[1] as HTMLElement;
        container.empty();

        // Header with refresh button
        const header = document.createElement('div');
        header.style.cssText = 'display:flex; align-items:center; justify-content:space-between; padding:4px 8px; border-bottom:1px solid var(--background-modifier-border);';

        const title = document.createElement('span');
        title.textContent = '🎬 Fountain Preview';
        title.style.cssText = 'font-weight:600; font-size:0.9em; color:var(--text-muted);';
        header.appendChild(title);

        const btnStyle = 'cursor:pointer; font-size:0.8em; padding:2px 8px; border-radius:4px; border:1px solid var(--background-modifier-border); background:var(--background-secondary); color:var(--text-normal); margin-left:4px;';

        const refreshBtn = document.createElement('button');
        refreshBtn.textContent = '↻ Refresh';
        refreshBtn.style.cssText = btnStyle;
        refreshBtn.addEventListener('click', () => this.forceRefresh());
        header.appendChild(refreshBtn);

        const pdfBtn = document.createElement('button');
        pdfBtn.textContent = '📄 Export PDF';
        pdfBtn.style.cssText = btnStyle;
        pdfBtn.addEventListener('click', () => this.exportPdf());
        header.appendChild(pdfBtn);

        container.appendChild(header);

        // Style element
        this.styleEl = document.createElement('style');
        container.appendChild(this.styleEl);

        // Scrollable content
        this.contentEl_inner = document.createElement('div');
        this.contentEl_inner.className = 'fountain-preview-content';
        container.appendChild(this.contentEl_inner);

        this.applyCustomCss();

        // Track when user switches to a different editor leaf
        this.registerEvent(this.app.workspace.on('active-leaf-change', (leaf) => {
            if (!leaf) return;
            const view = leaf.view;
            if (view instanceof MarkdownView && view.file) {
                this.trackedFile = view.file;
                this.renderFile();
                this.attachScrollSync(view);
            }
        }));

        // Real-time sync: listen to ANY file modification
        this.registerEvent(this.app.vault.on('modify', (file) => {
            if (this.trackedFile && file.path === this.trackedFile.path) {
                this.renderFile();
            }
        }));

        // Also listen to editor-change for truly instant updates (before file is saved)
        this.registerEvent(this.app.workspace.on('editor-change', (editor, info) => {
            // info is MarkdownView
            const mdView = info as MarkdownView;
            if (mdView.file && this.trackedFile && mdView.file.path === this.trackedFile.path) {
                // Get content directly from the editor for instant preview
                const content = editor.getValue();
                this.renderContent(content);
            }
        }));

        // Find the currently active file on initial open
        this.findActiveFile();
        this.renderFile();
    }

    async onClose() {
        if (this.scrollSyncCleanup) {
            this.scrollSyncCleanup();
            this.scrollSyncCleanup = null;
        }
    }

    /**
     * Find the currently active markdown file (if any).
     */
    findActiveFile() {
        const leaves = this.app.workspace.getLeavesOfType('markdown');
        for (const leaf of leaves) {
            const view = leaf.view;
            if (view instanceof MarkdownView && view.file) {
                this.trackedFile = view.file;
                this.attachScrollSync(view);
                return;
            }
        }
    }

    /**
     * Force refresh (manual button).
     */
    async forceRefresh() {
        this.findActiveFile();
        await this.renderFile();
    }

    /**
     * Read the tracked file from disk and render.
     */
    async renderFile() {
        if (!this.trackedFile) {
            this.contentEl_inner.innerHTML = '<div style="text-align:center; color:var(--text-muted); padding:2em;">Open a .fountain file, then click ↻ Refresh.</div>';
            return;
        }

        const content = await this.app.vault.read(this.trackedFile);
        this.renderContent(content);
    }

    /**
     * Render raw Fountain text into the preview pane.
     */
    renderContent(content: string) {
        const parsedLines = parseFountain(content);
        const html = fountainToHTML(parsedLines);
        this.contentEl_inner.innerHTML = html;
        this.applyCustomCss();
    }

    exportPdf() {
        if (!this.trackedFile) {
            new Notice('No file loaded in preview.');
            return;
        }
        const bodyHtml = this.contentEl_inner.innerHTML;
        new FountainPrintModal(this.app, this.plugin.settings.customCss || '', bodyHtml).open();
    }

    attachScrollSync(view: MarkdownView) {
        if (this.scrollSyncCleanup) {
            this.scrollSyncCleanup();
            this.scrollSyncCleanup = null;
        }
        const editorEl = view.containerEl.querySelector('.cm-scroller') as HTMLElement | null;
        if (!editorEl) return;
        const previewEl = this.contentEl_inner;
        const handler = () => {
            const fraction = editorEl.scrollTop / Math.max(1, editorEl.scrollHeight - editorEl.clientHeight);
            previewEl.scrollTop = fraction * (previewEl.scrollHeight - previewEl.clientHeight);
        };
        editorEl.addEventListener('scroll', handler, { passive: true });
        this.scrollSyncCleanup = () => editorEl.removeEventListener('scroll', handler);
    }

    applyCustomCss() {
        if (this.styleEl) {
            const previewCss = `
.fountain-preview-content {
    font-family: "Courier Prime", "Courier New", Courier, monospace;
    font-size: 12pt;
    line-height: 1.5;
    max-width: 8.5in;
    margin: 0 auto;
    padding: 1in 1in;
    background: var(--background-primary);
    color: var(--text-normal);
}

.fountain-line {
    margin: 0;
    padding: 0;
}

.fountain-empty {
    min-height: 1em;
}

/* Scene Heading */
.fountain-scene-heading {
    text-transform: uppercase;
    font-weight: bold;
    margin-top: 1.5em;
}

/* Character */
.fountain-character {
    margin-left: 22ch;
    text-transform: uppercase;
    margin-top: 1em;
}

/* Dialogue */
.fountain-dialogue {
    margin-left: 10ch;
    max-width: 35ch;
}

/* Parenthetical */
.fountain-parenthetical {
    margin-left: 16ch;
    max-width: 25ch;
}

/* Transition */
.fountain-transition {
    text-align: right;
    text-transform: uppercase;
    margin-top: 1em;
}

/* Centered */
.fountain-centered {
    text-align: center;
}

/* Action */
.fountain-action {
    margin-top: 0.5em;
}

/* Section Headings */
.fountain-section-heading-1 {
    text-align: center;
    font-size: 1.4em;
    font-weight: bold;
    text-transform: uppercase;
    margin: 3em 0 2em;
    padding: 0.5em 0;
    border-top: 1px solid var(--background-modifier-border);
    border-bottom: 1px solid var(--background-modifier-border);
    color: var(--text-accent);
}

.fountain-section-heading-2 {
    font-weight: bold;
    text-transform: uppercase;
    margin: 2em 0 0.5em;
    color: var(--text-muted);
}

.fountain-section-heading-3 {
    font-weight: bold;
    margin: 1.5em 0 0.5em;
    color: var(--text-muted);
}

/* ===== Dual Dialogue ===== */
.fountain-dual-dialogue {
    display: flex;
    gap: 2ch;
    margin-top: 1em;
    width: 100%;
}

.fountain-dual-col {
    flex: 1;
    min-width: 0;
}

/* Override margins inside dual columns */
.fountain-dual-col .fountain-character {
    margin-left: 5ch;
    margin-top: 0;
}

.fountain-dual-col .fountain-dialogue {
    margin-left: 0;
    max-width: none;
}

.fountain-dual-col .fountain-parenthetical {
    margin-left: 2ch;
    max-width: none;
}
`;
            this.styleEl.textContent = previewCss;
            if (this.plugin.settings.customCss) {
                this.styleEl.textContent += '\n' + this.plugin.settings.customCss;
            }
        }
    }
}

// ── Print Preview Modal ─────────────────────────────────────────────────────

class FountainPrintModal extends Modal {
    private customCss: string;
    private bodyHtml: string;
    private paperSize: 'letter' | 'a4' = 'letter';
    private margins: 'normal' | 'narrow' | 'tight' = 'normal';
    private showPageNumbers = false;

    constructor(app: App, customCss: string, bodyHtml: string) {
        super(app);
        this.customCss = customCss;
        this.bodyHtml = bodyHtml;
    }

    onOpen() {
        const { contentEl, modalEl } = this;
        contentEl.empty();

        // Size the modal
        modalEl.style.cssText = 'width:90vw; max-width:90vw; height:85vh; max-height:85vh; display:flex; flex-direction:column;';
        contentEl.style.cssText = 'flex:1; display:flex; flex-direction:column; overflow:hidden; padding:0;';

        // ── Toolbar ──────────────────────────────────────────────────────────
        const toolbar = contentEl.createDiv();
        toolbar.style.cssText = 'display:flex; align-items:center; gap:12px; padding:10px 16px; border-bottom:1px solid var(--background-modifier-border); flex-shrink:0; flex-wrap:wrap; background:var(--background-secondary);';

        const selStyle = 'padding:3px 6px; border-radius:4px; border:1px solid var(--background-modifier-border); background:var(--background-primary); color:var(--text-normal); font-size:0.85em;';
        const labelStyle = 'font-size:0.85em; color:var(--text-muted); white-space:nowrap;';

        // Paper size
        const paperLabel = toolbar.createSpan({ text: 'Paper:' });
        paperLabel.style.cssText = labelStyle;
        const paperSel = toolbar.createEl('select');
        paperSel.style.cssText = selStyle;
        [['letter', 'Letter (8.5"×11")'], ['a4', 'A4 (210×297mm)']].forEach(([v, t]) => {
            paperSel.createEl('option', { value: v, text: t });
        });
        paperSel.value = this.paperSize;
        paperSel.addEventListener('change', () => {
            this.paperSize = paperSel.value as 'letter' | 'a4';
            this.updatePreview(previewInner, previewStyle);
        });

        // Margins
        const marginLabel = toolbar.createSpan({ text: 'Margins:' });
        marginLabel.style.cssText = labelStyle;
        const marginSel = toolbar.createEl('select');
        marginSel.style.cssText = selStyle;
        [['normal', 'Normal (1")'], ['narrow', 'Narrow (¾")'], ['tight', 'Tight (½")']].forEach(([v, t]) => {
            marginSel.createEl('option', { value: v, text: t });
        });
        marginSel.value = this.margins;
        marginSel.addEventListener('change', () => {
            this.margins = marginSel.value as 'normal' | 'narrow' | 'tight';
            this.updatePreview(previewInner, previewStyle);
        });

        // Page numbers
        const pageNumWrap = toolbar.createDiv();
        pageNumWrap.style.cssText = 'display:flex; align-items:center; gap:5px;';
        const pageNumCb = document.createElement('input');
        pageNumCb.type = 'checkbox';
        pageNumCb.checked = this.showPageNumbers;
        pageNumWrap.appendChild(pageNumCb);
        const pageNumLabel = pageNumWrap.createSpan({ text: 'Page numbers' });
        pageNumLabel.style.cssText = labelStyle;
        pageNumCb.addEventListener('change', () => { this.showPageNumbers = pageNumCb.checked; });

        // Print button
        const printBtn = toolbar.createEl('button');
        printBtn.textContent = '🖨️ Print / Save as PDF';
        printBtn.style.cssText = 'margin-left:auto; padding:6px 16px; cursor:pointer; background:var(--interactive-accent); color:var(--text-on-accent); border:none; border-radius:4px; font-weight:600; font-size:0.9em;';
        printBtn.addEventListener('click', () => this.doPrint());

        // ── Preview area ──────────────────────────────────────────────────────
        const previewWrapper = contentEl.createDiv();
        previewWrapper.style.cssText = 'flex:1; overflow-y:auto; background:#666; padding:24px; display:flex; flex-direction:column; align-items:center;';

        // Scoped style tag for fountain classes (inside modal, so auto-cleaned on close)
        const previewStyle = previewWrapper.createEl('style');

        // The "paper" div
        const previewInner = previewWrapper.createDiv({ cls: 'fountain-preview-content fountain-modal-paper' });
        previewInner.innerHTML = this.bodyHtml;

        this.updatePreview(previewInner, previewStyle);
    }

    private getMarginValue(): string {
        return this.margins === 'narrow' ? '0.75in' : this.margins === 'tight' ? '0.5in' : '1in';
    }

    private updatePreview(previewInner: HTMLElement, previewStyle: HTMLElement) {
        const margin = this.getMarginValue();
        const width = this.paperSize === 'a4' ? '210mm' : '8.5in';

        previewInner.style.cssText = `
            background: white !important;
            color: black !important;
            width: ${width};
            max-width: 100%;
            padding: ${margin};
            font-family: "Courier Prime", "Courier New", Courier, monospace;
            font-size: 12pt;
            line-height: 1.5;
            box-shadow: 0 4px 20px rgba(0,0,0,0.5);
            min-height: 10in;
        `;

        previewStyle.textContent = `
.fountain-modal-paper .fountain-line { margin: 0; padding: 0; color: black; }
.fountain-modal-paper .fountain-empty { min-height: 1em; }
.fountain-modal-paper .fountain-scene-heading { text-transform: uppercase; font-weight: bold; margin-top: 1.5em; color: black; }
.fountain-modal-paper .fountain-character { margin-left: 22ch; text-transform: uppercase; margin-top: 1em; color: black; }
.fountain-modal-paper .fountain-dialogue { margin-left: 10ch; max-width: 35ch; color: black; }
.fountain-modal-paper .fountain-parenthetical { margin-left: 16ch; max-width: 25ch; color: black; }
.fountain-modal-paper .fountain-transition { text-align: right; text-transform: uppercase; margin-top: 1em; color: black; }
.fountain-modal-paper .fountain-centered { text-align: center; color: black; }
.fountain-modal-paper .fountain-action { margin-top: 0.5em; color: black; }
.fountain-modal-paper .fountain-section-heading-1 { text-align: center; font-size: 1.4em; font-weight: bold; text-transform: uppercase; margin: 3em 0 2em; border-top: 1px solid #ccc; border-bottom: 1px solid #ccc; padding: 0.5em 0; color: black; }
.fountain-modal-paper .fountain-section-heading-2 { font-weight: bold; text-transform: uppercase; margin: 2em 0 0.5em; color: black; }
.fountain-modal-paper .fountain-section-heading-3 { font-weight: bold; margin: 1.5em 0 0.5em; color: black; }
.fountain-modal-paper .fountain-dual-dialogue { display: flex; gap: 2ch; margin-top: 1em; width: 100%; }
.fountain-modal-paper .fountain-dual-col { flex: 1; min-width: 0; }
.fountain-modal-paper .fountain-dual-col .fountain-character { margin-left: 5ch; margin-top: 0; }
.fountain-modal-paper .fountain-dual-col .fountain-dialogue { margin-left: 0; max-width: none; }
.fountain-modal-paper .fountain-dual-col .fountain-parenthetical { margin-left: 2ch; max-width: none; }
${this.customCss}`;
    }

    private doPrint() {
        const margin = this.getMarginValue();
        const size = this.paperSize === 'a4' ? 'A4' : 'letter';
        const pageNumberCss = this.showPageNumbers
            ? `@page { @bottom-right { content: counter(page); font-family: "Courier Prime", "Courier New", Courier, monospace; font-size: 10pt; } }`
            : '';

        const printCss = `
@page { size: ${size}; margin: ${margin}; }
${pageNumberCss}
* { box-sizing: border-box; }
body { margin: 0; padding: 0; background: white; color: black; }

.fountain-preview-content {
    font-family: "Courier Prime", "Courier New", Courier, monospace;
    font-size: 12pt; line-height: 1.5;
    max-width: 100%; margin: 0; padding: 0;
    background: white; color: black;
}
.fountain-line { margin: 0; padding: 0; }
.fountain-empty { min-height: 1em; }

.fountain-scene-heading {
    text-transform: uppercase; font-weight: bold;
    margin-top: 1.5em; page-break-after: avoid;
}
.fountain-character {
    margin-left: 22ch; text-transform: uppercase;
    margin-top: 1em; page-break-after: avoid;
}
/* No page-break-before:avoid on dialogue — lets long blocks flow naturally across pages */
.fountain-dialogue { margin-left: 10ch; max-width: 35ch; }
.fountain-parenthetical { margin-left: 16ch; max-width: 25ch; page-break-after: avoid; }
.fountain-transition { text-align: right; text-transform: uppercase; margin-top: 1em; }
.fountain-centered { text-align: center; }
.fountain-action { margin-top: 0.5em; }

.fountain-section-heading-1 {
    page-break-before: always; page-break-after: always;
    text-align: center; font-size: 1.4em; font-weight: bold;
    text-transform: uppercase; padding-top: 4in;
}
.fountain-section-heading-2 { font-weight: bold; text-transform: uppercase; margin-top: 2em; page-break-after: avoid; }
.fountain-section-heading-3 { font-weight: bold; margin-top: 1.5em; page-break-after: avoid; }

/* No page-break-inside:avoid on dual-dialogue — lets long dual blocks flow naturally */
.fountain-dual-dialogue { display: flex; gap: 2ch; margin-top: 1em; width: 100%; }
.fountain-dual-col { flex: 1; min-width: 0; }
.fountain-dual-col .fountain-character { margin-left: 5ch; margin-top: 0; }
.fountain-dual-col .fountain-dialogue { margin-left: 0; max-width: none; }
.fountain-dual-col .fountain-parenthetical { margin-left: 2ch; max-width: none; }

${this.customCss}`;

        const overlay = document.createElement('div');
        overlay.id = 'fountain-print-overlay';
        overlay.className = 'fountain-preview-content';
        overlay.innerHTML = this.bodyHtml;
        document.body.appendChild(overlay);

        const printStyle = document.createElement('style');
        printStyle.id = 'fountain-print-style';
        printStyle.textContent = `
@media screen { #fountain-print-overlay { display: none !important; } }
@media print {
    body > *:not(#fountain-print-overlay) { display: none !important; }
    #fountain-print-overlay { display: block !important; }
}
${printCss}`;
        document.head.appendChild(printStyle);

        setTimeout(() => {
            window.print();
            setTimeout(() => { overlay.remove(); printStyle.remove(); }, 2000);
        }, 200);
    }

    onClose() {
        this.contentEl.empty();
    }
}
