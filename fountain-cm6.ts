import { Extension } from '@codemirror/state';
import { EditorView, Decoration, DecorationSet, ViewPlugin, ViewUpdate, WidgetType } from '@codemirror/view';

// Fountain regex patterns
const regexPatterns = {
    // Scene Headings: INT, EXT, EST, I/E, INT/EXT, etc., or starting with a period (forced)
    sceneHeading: /^(?:INT\.|EXT\.|EST\.|INT\/EXT\.|I\/E\.|I\/X\.).*|^\.[^.].*$/i,
    // Transitions: ends with TO:, or explicitly matching CUT TO:, FADE OUT., etc., or starting with >
    transition: /^(?:[A-Z\s]+TO:|FADE TO BLACK\.|FADE OUT\.|CUT TO BLACK\.|>.*[^<])$/i,
    // Centered text starts with > and ends with <
    centered: /^>\s*.*\s*<$/,
    // Character names are uppercase, can have numbers/spaces, and optionally a parenthetical (V.O.) at the end. Can't be empty.
    character: /^[\s]*[A-Z0-9\s]+(?: \([^)]+\))?\s*(?:\^)?$/,
    // Parenthetical must be wrapped in ()
    parenthetical: /^\s*\([^)]+\)\s*$/,
};

class DualDialogueWidget extends WidgetType {
    leftLines: { type: string, text: string }[];
    rightLines: { type: string, text: string }[];

    constructor(leftLines: { type: string, text: string }[], rightLines: { type: string, text: string }[]) {
        super();
        this.leftLines = leftLines;
        this.rightLines = rightLines;
    }

    eq(other: DualDialogueWidget) {
        // Simple equality check to prevent unnecessary re-rendering
        if (this.leftLines.length !== other.leftLines.length || this.rightLines.length !== other.rightLines.length) return false;
        for (let i = 0; i < this.leftLines.length; i++) {
            if (this.leftLines[i].text !== other.leftLines[i].text) return false;
        }
        for (let i = 0; i < this.rightLines.length; i++) {
            if (this.rightLines[i].text !== other.rightLines[i].text) return false;
        }
        return true;
    }

    toDOM() {
        // Create the main flex container
        const container = document.createElement('div');
        container.className = 'fountain-dual-dialogue-container';
        container.style.display = 'flex';
        container.style.justifyContent = 'space-between';
        container.style.width = '100%';
        container.style.marginTop = '1em';
        container.style.marginBottom = '1em';

        // Left column
        const leftCol = document.createElement('div');
        leftCol.className = 'fountain-dual-col-left';
        leftCol.style.flex = '1';
        leftCol.style.marginRight = '20px'; // Gutter

        this.leftLines.forEach(line => {
            const el = document.createElement('div');
            el.className = `fountain-${line.type} fountain-dual-left`;
            el.innerText = line.text;
            leftCol.appendChild(el);
        });

        // Right column
        const rightCol = document.createElement('div');
        rightCol.className = 'fountain-dual-col-right';
        rightCol.style.flex = '1';
        rightCol.style.marginLeft = '20px'; // Gutter

        this.rightLines.forEach(line => {
            const el = document.createElement('div');
            el.className = `fountain-${line.type} fountain-dual-right`;
            if (line.type === 'character') {
                el.className += ' fountain-dual-caret';
            }
            // In Live Preview widget text we could optionally strip the caret caret: el.innerText = line.text.replace(/\^$/, '').trim();
            // But leaving raw text is safer for visual equivalence unless requested.
            el.innerText = line.text;
            rightCol.appendChild(el);
        });

        container.appendChild(leftCol);
        container.appendChild(rightCol);

        return container;
    }

    ignoreEvent() { return false; }
}

const buildDecorations = (view: EditorView): DecorationSet => {
    const builder = [];
    const doc = view.state.doc;

    let i = 1;
    let lastLineWasCharacter = false;
    let lastLineWasParenthetical = false;
    let lastLineWasDialogue = false;
    let lastLineWasEmpty = true;

    interface LineDeco {
        lineNum: number;
        from: number;
        to: number;
        type: string;
        text: string;
        isDualRight?: boolean;
        isDualLeft?: boolean;
        isDualEmpty?: boolean;
        isDualProcessed?: boolean; // Avoid re-processing
    }
    const decos: LineDeco[] = [];

    while (i <= doc.lines) {
        const line = doc.line(i);
        const text = line.text;
        const trimmed = text.trim();

        let customType = '';

        if (trimmed === '') {
            customType = 'empty';
            lastLineWasEmpty = true;
            lastLineWasCharacter = false;
            lastLineWasParenthetical = false;
            lastLineWasDialogue = false;
        } else {
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
        }

        decos.push({
            lineNum: i,
            from: line.from,
            to: line.to,
            type: customType,
            text: trimmed
        });

        i++;
    }

    // Now process Dual Dialogue (retroactively)
    const blocksToReplace: { from: number, to: number, leftBlock: any[], rightBlock: any[] }[] = [];

    for (let j = 0; j < decos.length; j++) {
        const deco = decos[j];

        // Found the ^ marker identifying the right side
        if (deco.type === 'character' && deco.text.endsWith('^') && !deco.isDualProcessed) {

            // Gather the Right Group
            const rightGroup = [deco];
            let k = j + 1;
            // Include consecutive dialogue/parenthetical lines or even empty lines if they belong to this character block
            while (k < decos.length) {
                if (decos[k].type === 'dialogue' || decos[k].type === 'parenthetical') {
                    rightGroup.push(decos[k]);
                    k++;
                } else if (decos[k].type === 'empty' && k + 1 < decos.length && (decos[k + 1].type === 'dialogue' || decos[k + 1].type === 'parenthetical')) {
                    // Soft empty line within a block maybe? Standard fountain allows parentheticals after empty lines occasionally, though rare.
                    rightGroup.push(decos[k]);
                    k++;
                } else {
                    break;
                }
            }

            // Track back to find Left Group
            let findLeft = j - 1;

            const emptyMiddleGroup = [];
            // Track optional empty lines between left and right groups
            while (findLeft >= 0 && decos[findLeft].type === 'empty') {
                emptyMiddleGroup.unshift(decos[findLeft]);
                findLeft--;
            }

            // Gather Left Group
            const leftGroup = [];
            while (findLeft >= 0) {
                if (decos[findLeft].type === 'dialogue' || decos[findLeft].type === 'parenthetical') {
                    leftGroup.unshift(decos[findLeft]);
                    findLeft--;
                } else if (decos[findLeft].type === 'character') {
                    leftGroup.unshift(decos[findLeft]);
                    // Character is the start of the block. Stop here.
                    break;
                } else if (decos[findLeft].type === 'empty' && findLeft - 1 >= 0 && (decos[findLeft - 1].type === 'dialogue' || decos[findLeft - 1].type === 'parenthetical' || decos[findLeft - 1].type === 'character')) {
                    // Empty lines within the left block
                    leftGroup.unshift(decos[findLeft]);
                    findLeft--;
                } else {
                    break; // Action or something else, abort
                }
            }

            // If we validly found a character on the left
            if (leftGroup.length > 0 && leftGroup[0].type === 'character') {

                // Mark them processed
                leftGroup.forEach(item => item.isDualProcessed = true);
                emptyMiddleGroup.forEach(item => item.isDualProcessed = true);
                rightGroup.forEach(item => item.isDualProcessed = true);

                const blockFrom = leftGroup[0].from;
                const blockTo = rightGroup[rightGroup.length - 1].to;

                blocksToReplace.push({
                    from: blockFrom,
                    to: blockTo,
                    leftBlock: leftGroup,
                    rightBlock: rightGroup
                });
            }
        }
    }

    // Apply CodeMirror Decorations
    // Note: We're replacing the underlying block with our custom Widget. 
    // This entirely hides the dual dialogue raw text from the Live Preview unless the cursor enters the block.
    for (const b of blocksToReplace) {
        builder.push(Decoration.replace({
            widget: new DualDialogueWidget(
                b.leftBlock.filter(l => l.type !== 'empty'),
                b.rightBlock.filter(l => l.type !== 'empty')
            ),
            block: true
        }).range(b.from, b.to));
    }

    // Apply standard line decorators for the rest
    for (const deco of decos) {
        if (deco.isDualProcessed) continue; // Skip since it's inside the Widget
        if (deco.type === 'empty') continue;

        const cls = `fountain-${deco.type}`;
        builder.push(Decoration.line({ class: cls }).range(deco.from));
    }

    // CodeMirror requires decorations to be sorted by `.from` to create a sensible DecorationSet.
    builder.sort((a, b) => a.from - b.from);

    return Decoration.set(builder);
};

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
        decorations: v => v.decorations
    }
);

export const fountainLivePreview: Extension = [
    fountainViewPlugin
];
