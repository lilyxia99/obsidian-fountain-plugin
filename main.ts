import { Plugin } from 'obsidian';
import { fountainLivePreview } from './fountain-cm6';
import { FountainPluginSettings, DEFAULT_SETTINGS, FountainSettingTab } from './settings';

export default class FountainPlugin extends Plugin {
    settings: FountainPluginSettings;
    styleTag: HTMLStyleElement;

    async onload() {
        console.log('Loading Fountain Live Preview plugin');

        await this.loadSettings();

        // Register `.fountain` to be edited as markdown
        this.registerExtensions(['fountain'], 'markdown');

        // Register the CodeMirror extension for Live Preview
        this.registerEditorExtension(fountainLivePreview);

        // Add settings tab
        this.addSettingTab(new FountainSettingTab(this.app, this));

        // Create style tag for custom CSS
        this.styleTag = document.createElement('style');
        this.styleTag.id = 'fountain-custom-css';
        document.head.appendChild(this.styleTag);

        // Apply initial settings
        this.applyCssSettings();
    }

    onunload() {
        console.log('Unloading Fountain Live Preview plugin');
        if (this.styleTag) {
            this.styleTag.remove();
        }
    }

    async loadSettings() {
        this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    }

    async saveSettings() {
        await this.saveData(this.settings);
        this.applyCssSettings(); // Update CSS live
    }

    applyCssSettings() {
        if (this.styleTag) {
            this.styleTag.innerText = this.settings.customCss;
        }
    }
}
