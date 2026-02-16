import { EditorView, basicSetup } from "codemirror";
import { StreamLanguage } from "@codemirror/language";
import { autocompletion } from "@codemirror/autocomplete";

const FANO_TOKENS = {
    'article': /Article\s+[IVX]+/,
    'point': /Point\s+[1-7]/,
    'line': /Line\s+[1-7]/,
    'quadrant': /(KK|KU|UK|UU)/,
    'character': /(Metatron|Solomon|Solon|Asabiyyah|Enoch|Speaker|Genesis|Observer)/,
    'ratio': /\d+\/\d+/,
    'angle': /\d+°/,
    'hex': /#[0-9a-fA-F]{6}/
};

const fanoLanguage = StreamLanguage.define({
    token(stream) {
        for (const [name, pattern] of Object.entries(FANO_TOKENS)) {
            if (stream.match(pattern)) {
                return name;
            }
        }
        if (stream.match(/[,\[\]{}]/)) {
            return 'bracket';
        }
        if (stream.match(/[A-Z][a-z]+/)) {
            return 'keyword';
        }
        if (stream.match(/\d+/)) {
            return 'number';
        }
        stream.next();
        return null;
    }
});

async function fetchWordNetCompletions(word) {
    try {
        const response = await fetch(`http://localhost:4096/api/wordnet/lookup?word=${encodeURIComponent(word)}`);
        return await response.json();
    } catch (e) {
        return [];
    }
}

function wordnetCompletion(context) {
    const word = context.matchBefore(/\w*/);
    if (!word || word.from === word.to) return null;
    
    return {
        from: word.from,
        options: async () => {
            const synsets = await fetchWordNetCompletions(word.text);
            const options = [];
            
            for (const synset of synsets.slice(0, 5)) {
                options.push({
                    label: synset.words[0] || word.text,
                    type: synset.pos === 'noun' ? 'keyword' : 'variable',
                    detail: synset.def?.substring(0, 60),
                    apply: synset.words[0] || word.text
                });
            }
            
            return options;
        }
    };
}

export function createFanoEditor(parent, initialContent = '') {
    const view = new EditorView({
        doc: initialContent,
        extensions: [
            basicSetup,
            fanoLanguage,
            autocompletion({ override: [wordnetCompletion] }),
            EditorView.theme({
                '&': { height: '100%' },
                '.cm-scroller': { overflow: 'auto' },
                '.cm-content': { fontFamily: 'monospace' },
                '.tok-article': { color: '#ff79c6' },
                '.tok-point': { color: '#8be9fd' },
                '.tok-line': { color: '#bd93f9' },
                '.tok-quadrant': { color: '#ffb86c' },
                '.tok-character': { color: '#50fa7b' },
                '.tok-ratio': { color: '#ff5555' },
                '.tok-angle': { color: '#f1fa8c' }
            })
        ],
        parent
    });
    
    return view;
}

export { fanoLanguage, wordnetCompletion };
