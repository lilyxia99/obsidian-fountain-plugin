import { ItemView, WorkspaceLeaf, TFile, MarkdownView } from 'obsidian';
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
        // Remove > and < markers
        displayText = escapeHtml(line.text.replace(/^>\s*/, '').replace(/\s*<$/, ''));
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

        const refreshBtn = document.createElement('button');
        refreshBtn.textContent = '↻ Refresh';
        refreshBtn.style.cssText = 'cursor:pointer; font-size:0.8em; padding:2px 8px; border-radius:4px; border:1px solid var(--background-modifier-border); background:var(--background-secondary); color:var(--text-normal);';
        refreshBtn.addEventListener('click', () => this.forceRefresh());
        header.appendChild(refreshBtn);

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
                // User switched to a different file — update tracked file
                this.trackedFile = view.file;
                this.renderFile();
            }
            // If user clicks the preview pane itself, do nothing — keep showing the last file
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
        // cleanup handled by Obsidian's registerEvent
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
