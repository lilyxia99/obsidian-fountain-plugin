import { App, PluginSettingTab, Setting, ButtonComponent } from 'obsidian';
import FountainPlugin from './main';

export interface FountainPluginSettings {
    customCss: string;
}

const defaultCss = `/* Scene Headings */
    .markdown - source - view.mod - cm6.cm - content > .cm - line.fountain - scene - heading {
    text - transform: uppercase!important;
    font - weight: bold!important;
}

/* Character */
/* ~2.2 inches from left text margin */
.markdown - source - view.mod - cm6.cm - content > .cm - line.fountain - character {
    text - align: left!important;
    margin - left: 22ch!important;
    text - transform: uppercase!important;
}

/* Dialogue */
/* ~1.0 inches from left text margin, ~3.5 inches wide */
.markdown - source - view.mod - cm6.cm - content > .cm - line.fountain - dialogue {
    margin - left: 10ch!important;
    max - width: 40ch!important;
}

/* Parenthetical */
/* ~1.6 inches from left text margin, ~2.0 inches wide */
.markdown - source - view.mod - cm6.cm - content > .cm - line.fountain - parenthetical {
    text - align: left!important;
    margin - left: 16ch!important;
    max - width: 25ch!important;
}

/* Transitions */
/* Flush right or ~4.0 inches from left */
.markdown - source - view.mod - cm6.cm - content > .cm - line.fountain - transition {
    text - align: right!important;
    text - transform: uppercase!important;
}

/* Centered */
.markdown - source - view.mod - cm6.cm - content > .cm - line.fountain - centered {
    text - align: center!important;
}

/* Dual Dialogue Left */
.markdown - source - view.mod - cm6.cm - content > .cm - line.fountain - dual - left.fountain - character {
    margin - left: 5ch!important;
}
.markdown - source - view.mod - cm6.cm - content > .cm - line.fountain - dual - left.fountain - dialogue {
    margin - left: 0ch!important;
    max - width: 30ch!important;
}
.markdown - source - view.mod - cm6.cm - content > .cm - line.fountain - dual - left.fountain - parenthetical {
    margin - left: 2ch!important;
}

/* Dual Dialogue Right (Shifted to the right side of the screen) */
/* In Live Preview, true flexbox side-by-side isn't possible because lines cannot be wrapped */
.markdown - source - view.mod - cm6.cm - content > .cm - line.fountain - dual - right.fountain - character {
    margin - left: 45ch!important;
}
.markdown - source - view.mod - cm6.cm - content > .cm - line.fountain - dual - right.fountain - dialogue {
    margin - left: 40ch!important;
    max - width: 30ch!important;
}
.markdown - source - view.mod - cm6.cm - content > .cm - line.fountain - dual - right.fountain - parenthetical {
    margin - left: 42ch!important;
}

/* Hide the caret from dual dialogue character */
.markdown - source - view.mod - cm6.cm - content > .cm - line.fountain - dual - caret {
    /* Optional */
} `;

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
    }
}
