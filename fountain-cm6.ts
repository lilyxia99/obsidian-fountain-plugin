import { Extension } from '@codemirror/state';
import { EditorView, Decoration, DecorationSet, ViewPlugin, ViewUpdate } from '@codemirror/view';

// Fountain regex patterns
const regexPatterns = {
    sceneHeading: /^(?:INT\.|EXT\.|EST\.|INT\/EXT\.|I\/E\.|I\/X\.).*|^\.[^.].*$/i,
    transition: /^(?:[A-Z\s]+TO:|FADE TO BLACK\.|FADE OUT\.|CUT TO BLACK\.|>.*[^<])$/i,
    centered: /^>\s*.*\s*<$/,
    character: /^[\s]*[A-Z0-9\s]+(?: \([^)]+\))?\s*(?:\^)?$/,
    parenthetical: /^\s*\([^)]+\)\s*$/,
};

/**
 * Simple line-by-line Fountain classifier for Live Preview decorations.
 * Dual dialogue is NOT handled here — it only gets styled in the Preview Pane.
 */
function buildDecorations(view: EditorView): DecorationSet {
    const builder: any[] = [];
    const doc = view.state.doc;

    let i = 1;
    let lastLineWasCharacter = false;
    let lastLineWasParenthetical = false;
    let lastLineWasDialogue = false;
    let lastLineWasEmpty = true;

    while (i <= doc.lines) {
        const line = doc.line(i);
        const text = line.text;
        const trimmed = text.trim();
        let customType = '';

        if (trimmed === '') {
            // Fountain spec: whitespace-only line (e.g. two spaces) inside
            // a dialogue context continues the dialogue.
            const isWhitespaceOnly = text.length > 0;
            const inDialogueContext = lastLineWasCharacter || lastLineWasParenthetical || lastLineWasDialogue;

            if (isWhitespaceOnly && inDialogueContext) {
                // Dialogue continuation — keep dialogue state, apply dialogue class
                builder.push(Decoration.line({ class: 'fountain-dialogue' }).range(line.from));
            } else {
                lastLineWasEmpty = true;
                lastLineWasCharacter = false;
                lastLineWasParenthetical = false;
                lastLineWasDialogue = false;
            }
            i++;
            continue;
        }

        if (regexPatterns.sceneHeading.test(trimmed)) {
            customType = 'scene-heading';
            lastLineWasCharacter = false;
            lastLineWasParenthetical = false;
            lastLineWasDialogue = false;
        } else if (regexPatterns.centered.test(trimmed)) {
            customType = 'centered';
            lastLineWasCharacter = false;
            lastLineWasParenthetical = false;
            lastLineWasDialogue = false;
        } else if (regexPatterns.transition.test(trimmed)) {
            customType = 'transition';
            lastLineWasCharacter = false;
            lastLineWasParenthetical = false;
            lastLineWasDialogue = false;
        } else if (
            lastLineWasEmpty &&
            regexPatterns.character.test(text) &&
            !regexPatterns.sceneHeading.test(trimmed) &&
            !regexPatterns.transition.test(trimmed)
        ) {
            customType = 'character';
            lastLineWasCharacter = true;
            lastLineWasParenthetical = false;
            lastLineWasDialogue = false;
        } else if ((lastLineWasCharacter || lastLineWasParenthetical || lastLineWasDialogue) && regexPatterns.parenthetical.test(trimmed)) {
            customType = 'parenthetical';
            lastLineWasCharacter = false;
            lastLineWasParenthetical = true;
            lastLineWasDialogue = false;
        } else if (lastLineWasCharacter || lastLineWasParenthetical || lastLineWasDialogue) {
            customType = 'dialogue';
            lastLineWasCharacter = false;
            lastLineWasParenthetical = false;
            lastLineWasDialogue = true;
        } else {
            customType = 'action';
            lastLineWasCharacter = false;
            lastLineWasParenthetical = false;
            lastLineWasDialogue = false;
        }

        lastLineWasEmpty = false;
        builder.push(Decoration.line({ class: `fountain-${customType}` }).range(line.from));
        i++;
    }

    return Decoration.set(builder, true);
}

const fountainViewPlugin = ViewPlugin.fromClass(
    class {
        decorations: DecorationSet;

        constructor(view: EditorView) {
            this.decorations = buildDecorations(view);
        }

        update(update: ViewUpdate) {
            if (update.docChanged || update.viewportChanged) {
                this.decorations = buildDecorations(update.view);
            }
        }
    },
    {
        decorations: v => v.decorations,
    }
);

export const fountainLivePreview: Extension = [
    fountainViewPlugin,
];
