import { Plugin, App, PluginSettingTab, Setting, TFile, Menu, MenuItem } from 'obsidian';

const VIEW_TYPE_WORDNET = 'wordnet-browser';
const API_BASE = 'http://localhost:4096/api/wordnet';

export default class FanoGardenPlugin extends Plugin {
    async onload() {
        console.log('Loading Fano Garden plugin with WordNet');
        
        this.registerView(VIEW_TYPE_WORDNET, (leaf) => new WordNetBrowserView(leaf, this));
        
        this.addCommand({
            id: 'open-wordnet-browser',
            name: 'Open WordNet Browser',
            callback: () => this.activateWordNetView()
        });
        
        this.addCommand({
            id: 'lookup-wordnet-selection',
            name: 'Look up in WordNet',
            editorCallback: (editor) => {
                const word = editor.getSelection();
                if (word) this.openWordNetView(word.trim());
            }
        });
        
        this.addCommand({
            id: 'map-to-fano',
            name: 'Map to Fano Point',
            editorCallback: async (editor) => {
                const word = editor.getSelection();
                if (word) {
                    const response = await fetch(`${API_BASE}/fano?word=${encodeURIComponent(word.trim())}`);
                    const data = await response.json();
                    editor.replaceSelection(`${word} → ${data.fanoName} (Point ${data.fanoPoint}, Hue ${data.hue}°)`);
                }
            }
        });
        
        this.addRibbonIcon('book-open', 'WordNet Browser', () => {
            this.activateWordNetView();
        });
        
        this.addSettingTab(new FanoGardenSettingTab(this.app, this));
    }
    
    async activateWordNetView(word = '') {
        const leaf = this.app.workspace.getRightLeaf(false);
        await leaf.setViewState({
            type: VIEW_TYPE_WORDNET,
            state: { word }
        });
        this.app.workspace.revealLeaf(leaf);
    }
    
    async openWordNetView(word: string) {
        await this.activateWordNetView(word);
    }
}

class WordNetBrowserView extends Object {
    constructor(leaf, plugin) {
        super();
        this.leaf = leaf;
        this.plugin = plugin;
    }
    
    getViewType() { return VIEW_TYPE_WORDNET; }
    getDisplayText() { return 'WordNet Browser'; }
    
    async onOpen() {
        const container = this.containerEl;
        container.empty();
        container.style.padding = '16px';
        
        const header = container.createEl('h2', { text: 'WordNet Browser' });
        
        const searchRow = container.createDiv({ cls: 'search-row' });
        const input = searchRow.createEl('input', {
            type: 'text',
            placeholder: 'Search WordNet...',
            cls: 'wordnet-input'
        });
        input.style.width = '70%';
        input.style.padding = '8px';
        input.style.marginRight = '8px';
        
        const searchBtn = searchRow.createEl('button', { text: 'Search', cls: 'search-btn' });
        searchBtn.style.padding = '8px 16px';
        
        const results = container.createDiv({ cls: 'results', style: 'margin-top: 16px; max-height: 70vh; overflow-y: auto;' });
        
        const state = this.leaf.view?.state?.state;
        if (state?.word) {
            input.value = state.word;
            this.doSearch(state.word);
        }
        
        input.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.doSearch(input.value);
        });
        
        searchBtn.addEventListener('click', () => this.doSearch(input.value));
    }
    
    async doSearch(word) {
        if (!word.trim()) return;
        
        const results = this.containerEl.querySelector('.results');
        results.innerHTML = '<p>Loading...</p>';
        
        try {
            const response = await fetch(`${API_BASE}/lookup?word=${encodeURIComponent(word)}`);
            const data = await response.json();
            
            results.innerHTML = '';
            
            if (data.length === 0) {
                results.createEl('p', { text: 'No results found' });
                return;
            }
            
            const fanoResponse = await fetch(`${API_BASE}/fano?word=${encodeURIComponent(word)}`);
            const fanoData = await fanoResponse.json();
            
            const fanoInfo = results.createDiv({ cls: 'fano-info', style: 'margin-bottom: 16px; padding: 12px; background: #2a2a2a; border-radius: 8px;' });
            fanoInfo.createEl('div', { text: `Fano Point: ${fanoData.fanoPoint} - ${fanoData.fanoName}`, style: 'font-weight: bold; color: hsl(${fanoData.hue}, 70%, 60%)' });
            fanoInfo.createEl('div', { text: `Hue: ${fanoData.hue}°`, style: 'color: #888' });
            
            for (const synset of data) {
                const card = results.createDiv({ cls: 'synset-card', style: 'margin-bottom: 12px; padding: 12px; background: #1a1a1a; border-radius: 8px; border-left: 3px solid hsl(${this.getPOSColor(synset.pos)}, 70%, 50%)' });
                
                card.createEl('div', { 
                    text: `[${synset.pos}] ${synset.words.join(', ')}`,
                    style: 'font-weight: bold; margin-bottom: 4px;'
                });
                
                card.createEl('div', { 
                    text: synset.def,
                    style: 'color: #ccc; margin-bottom: 8px;'
                });
                
                if (synset.examples?.length) {
                    const examples = card.createDiv({ style: 'font-style: italic; color: #888;' });
                    synset.examples.forEach(ex => {
                        examples.createEl('div', { text: `"${ex}"`, style: 'margin-left: 12px;' });
                    });
                }
            }
        } catch (e) {
            results.innerHTML = `<p style="color: red">Error: ${e.message}</p>`;
        }
    }
    
    getPOSColor(pos) {
        const colors = { noun: '200', verb: '120', adj: '280', adv: '40' };
        return colors[pos] || '180';
    }
}

class FanoGardenSettingTab extends PluginSettingTab {
    constructor(app, plugin) {
        super(app, plugin);
    }
    
    display() {
        const { containerEl } = this;
        containerEl.empty();
        containerEl.createEl('h2', { text: 'Fano Garden Settings' });
        
        new Setting(containerEl)
            .setName('WordNet API')
            .setDesc('URL of the WordNet service')
            .addText(text => text
                .setValue('http://localhost:4096')
                .onChange(value => {
                    // Save setting if needed
                }));
    }
}
