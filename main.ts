import { Plugin, WorkspaceLeaf } from 'obsidian';
import { fountainLivePreview } from './fountain-cm6';
import { FountainPluginSettings, DEFAULT_SETTINGS, FountainSettingTab } from './settings';
import { FountainPreviewView, FOUNTAIN_PREVIEW_VIEW } from './fountain-preview';

export default class FountainPlugin extends Plugin {
    settings: FountainPluginSettings;
    styleTag: HTMLStyleElement;

    async onload() {
        console.log('[Fountain Plugin] Loading');

        await this.loadSettings();

        // Register `.fountain` to be edited as markdown
        this.registerExtensions(['fountain'], 'markdown');

        // Register the CodeMirror extension for Live Preview (simple line decorations)
        this.registerEditorExtension(fountainLivePreview);

        // Register the Fountain Preview View
        this.registerView(
            FOUNTAIN_PREVIEW_VIEW,
            (leaf: WorkspaceLeaf) => new FountainPreviewView(leaf, this)
        );

        // Add command to open the preview pane
        this.addCommand({
            id: 'open-fountain-preview',
            name: 'Open Fountain Preview',
            callback: () => this.activatePreview(),
        });

        // Add ribbon icon
        this.addRibbonIcon('film', 'Open Fountain Preview', () => {
            this.activatePreview();
        });

        // Add settings tab
        this.addSettingTab(new FountainSettingTab(this.app, this));

        // Create style tag for custom CSS (used in Live Preview)
        this.styleTag = document.createElement('style');
        this.styleTag.id = 'fountain-custom-css';
        document.head.appendChild(this.styleTag);

        // Apply initial settings
        this.applyCssSettings();

        console.log('[Fountain Plugin] Loaded');
    }

    onunload() {
        console.log('[Fountain Plugin] Unloading');
        if (this.styleTag) {
            this.styleTag.remove();
        }
    }

    async activatePreview() {
        const existing = this.app.workspace.getLeavesOfType(FOUNTAIN_PREVIEW_VIEW);

        if (existing.length) {
            // Focus the existing preview
            this.app.workspace.revealLeaf(existing[0]);
            return;
        }

        // Open in the right sidebar
        const leaf = this.app.workspace.getRightLeaf(false);
        if (leaf) {
            await leaf.setViewState({
                type: FOUNTAIN_PREVIEW_VIEW,
                active: true,
            });
            this.app.workspace.revealLeaf(leaf);
        }
    }

    async loadSettings() {
        this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    }

    async saveSettings() {
        await this.saveData(this.settings);
        this.applyCssSettings();
    }

    applyCssSettings() {
        if (this.styleTag) {
            this.styleTag.innerText = this.settings.customCss;
        }
    }
}
