import { App, PluginSettingTab, Setting, ButtonComponent } from 'obsidian';
import FountainPlugin from './main';

export interface FountainPluginSettings {
    customCss: string;
}

const defaultCss = `/* Scene Headings */
.markdown-source-view.mod-cm6 .cm-content > .cm-line.fountain-scene-heading {
    text-transform: uppercase !important;
    font-weight: bold !important;
}

/* Character */
.markdown-source-view.mod-cm6 .cm-content > .cm-line.fountain-character {
    text-align: left !important;
    margin-left: 22ch !important;
    text-transform: uppercase !important;
}

/* Dialogue */
.markdown-source-view.mod-cm6 .cm-content > .cm-line.fountain-dialogue {
    margin-left: 10ch !important;
    max-width: 40ch !important;
}

/* Parenthetical */
.markdown-source-view.mod-cm6 .cm-content > .cm-line.fountain-parenthetical {
    text-align: left !important;
    margin-left: 16ch !important;
    max-width: 25ch !important;
}

/* Transitions */
.markdown-source-view.mod-cm6 .cm-content > .cm-line.fountain-transition {
    text-align: right !important;
    text-transform: uppercase !important;
}

/* Centered */
.markdown-source-view.mod-cm6 .cm-content > .cm-line.fountain-centered {
    text-align: center !important;
}

/* Dual Dialogue Left — override normal margins, constrain to left half */
.markdown-source-view.mod-cm6 .cm-content > .cm-line.fountain-dual-left.fountain-character {
    margin-left: 5ch !important;
}
.markdown-source-view.mod-cm6 .cm-content > .cm-line.fountain-dual-left.fountain-dialogue {
    margin-left: 0 !important;
    max-width: none !important;
}
.markdown-source-view.mod-cm6 .cm-content > .cm-line.fountain-dual-left.fountain-parenthetical {
    margin-left: 2ch !important;
}

/* Dual Dialogue Right — override normal margins for right column */
.markdown-source-view.mod-cm6 .cm-content > .cm-line.fountain-dual-right.fountain-character {
    margin-left: 5ch !important;
    text-align: left !important;
}
.markdown-source-view.mod-cm6 .cm-content > .cm-line.fountain-dual-right.fountain-dialogue {
    margin-left: 0 !important;
    max-width: none !important;
}
.markdown-source-view.mod-cm6 .cm-content > .cm-line.fountain-dual-right.fountain-parenthetical {
    margin-left: 2ch !important;
}
`;

export const DEFAULT_SETTINGS: FountainPluginSettings = {
    customCss: defaultCss,
};

export class FountainSettingTab extends PluginSettingTab {
    plugin: FountainPlugin;

    constructor(app: App, plugin: FountainPlugin) {
        super(app, plugin);
        this.plugin = plugin;
    }

    display(): void {
        const { containerEl } = this;

        containerEl.empty();

        containerEl.createEl('h2', { text: 'Fountain Live Preview Settings' });

        containerEl.createEl('div', { text: 'You can directly edit the CSS used for Fountain element rendering in the Live Preview here. This provides maximum flexibility.' });

        new Setting(containerEl)
            .setName('Reset CSS to Defaults')
            .setDesc('If you messed up your CSS or want to load newly added CSS features (like Dual Dialogue), click this button.')
            .addButton((button: ButtonComponent) => {
                button.setButtonText('Reset Defaults')
                    .setWarning()
                    .onClick(async () => {
                        this.plugin.settings.customCss = defaultCss;
                        await this.plugin.saveSettings();
                        this.display(); // re-render the settings tab to update the text area
                    });
            });

        new Setting(containerEl)
            .setName('Raw CSS')
            .setDesc('Edit this CSS to change how Fountain elements look in Live Preview. This CSS is injected exactly as written.')
            .addTextArea(text => text
                .setPlaceholder('Enter raw CSS here...')
                .setValue(this.plugin.settings.customCss)
                .onChange(async (value) => {
                    this.plugin.settings.customCss = value;
                    await this.plugin.saveSettings();
                })
            );

        // Make the text area larger for easier editing
        const textAreas = containerEl.querySelectorAll('textarea');
        textAreas.forEach(ta => {
            ta.style.width = '100%';
            ta.style.height = '400px';
            ta.style.fontFamily = 'monospace';
        });
    }
}
