const fs = require('fs');
const path = require('path');

class WordNetService {
    constructor(dictPath = path.join(__dirname, 'dict')) {
        this.dictPath = dictPath;
        this.index = { noun: {}, verb: {}, adj: {}, adv: {} };
        this.data = { noun: {}, verb: {}, adj: {}, adv: {} };
        this.posMap = { n: 'noun', v: 'verb', a: 'adj', r: 'adv', s: 'adj' };
        this.loaded = false;
    }

    load() {
        if (this.loaded) return;
        
        const posFiles = ['noun', 'verb', 'adj', 'adv'];
        
        for (const pos of posFiles) {
            this.loadIndex(pos);
            this.loadData(pos);
        }
        
        this.loaded = true;
        console.log(`WordNet loaded: ${Object.keys(this.index.noun).length} nouns, ${Object.keys(this.index.verb).length} verbs`);
    }

    loadIndex(pos) {
        const indexPath = path.join(this.dictPath, `index.${pos}`);
        if (!fs.existsSync(indexPath)) return;
        
        const content = fs.readFileSync(indexPath, 'utf-8');
        const lines = content.split('\n');
        
        for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed || trimmed.startsWith(' ')) continue;
            
            const parts = trimmed.split(/\s+/);
            if (parts.length < 10) continue;
            
            const lemma = parts[0];
            const posCode = parts[1];
            const synsetCnt = parseInt(parts[2], 10);
            const p_synsetCnt = parseInt(parts[3], 10);
            
            // Find where sense_cnt is: after the pointer symbols
            // Pointer symbols count = p_synsetCnt, but they're listed as single chars
            const senseOffsetStart = 4 + p_synsetCnt + 1; // lemma + pos + synset_cnt + p_synset_cnt + sense_cnt
            const senseCnt = parseInt(parts[4 + p_synsetCnt], 10);
            
            const senses = [];
            for (let i = 0; i < senseCnt && (senseOffsetStart + 1 + i) < parts.length; i++) {
                senses.push({ synsetOffset: parts[senseOffsetStart + 1 + i] });
            }
            
            const key = `${lemma}.${posCode}`;
            this.index[pos][key] = { lemma, posCode, synsetCnt, p_synsetCnt, senses };
        }
    }

    loadData(pos) {
        const dataPath = path.join(this.dictPath, `data.${pos}`);
        if (!fs.existsSync(dataPath)) return;
        
        const content = fs.readFileSync(dataPath, 'utf-8');
        const lines = content.split('\n');
        
        const posKey = this.posMap[pos] || pos;
        
        for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed || !/^\d/.test(trimmed)) continue;
            
            const synsetOffset = parseInt(line.substring(0, 8).trim(), 10);
            if (isNaN(synsetOffset)) continue;
            
            const ssType = line.charAt(12).trim();
            if (!ssType) continue;
            
            const mappedPos = this.posMap[ssType] || posKey;
            if (!this.data[mappedPos]) continue;
            
            const wCnt = parseInt(line.substring(14, 16).trim(), 10) || 0;
            
            let curPos = 17;
            const words = [];
            for (let i = 0; i < wCnt; i++) {
                const wordStart = curPos;
                const wordEnd = line.indexOf(' ', wordStart);
                if (wordEnd === -1 || wordEnd - wordStart > 50) break;
                const word = line.substring(wordStart, wordEnd);
                const lexId = line.substring(wordEnd + 1, wordEnd + 3).trim();
                words.push({ word: word.replace(/_/g, ' '), lexId: parseInt(lexId, 10) || 0 });
                curPos = wordEnd + 3;
            }
            
            const pCntStart = curPos;
            const pCnt = parseInt(line.substring(pCntStart, pCntStart + 2).trim(), 10) || 0;
            
            curPos = pCntStart + 2;
            const pointers = [];
            for (let i = 0; i < pCnt; i++) {
                if (curPos + 14 > line.length) break;
                const ptr = line.substring(curPos, curPos + 1);
                const ptrOffset = parseInt(line.substring(curPos + 1, curPos + 9).trim(), 10);
                const ptrPos = line.substring(curPos + 9, curPos + 10);
                const source = parseInt(line.substring(curPos + 10, curPos + 12).trim(), 10) || 0;
                const target = parseInt(line.substring(curPos + 12, curPos + 14).trim(), 10) || 0;
                pointers.push({ ptr, synsetOffset: ptrOffset, pos: ptrPos, source, target });
                curPos += 14;
            }
            
            const glossStart = line.indexOf('|');
            let def = '';
            let examples = [];
            
            if (glossStart !== -1) {
                const glossPart = line.substring(glossStart + 2);
                const semicolon = glossPart.indexOf(';');
                if (semicolon !== -1) {
                    def = glossPart.substring(0, semicolon).trim();
                    const exPart = glossPart.substring(semicolon + 1);
                    const exMatches = exPart.match(/"[^"]+"/g);
                    if (exMatches) {
                        examples = exMatches.map(e => e.replace(/"/g, ''));
                    }
                } else {
                    def = glossPart.trim();
                }
            }
            
            const key = `${synsetOffset}.${ssType}`;
            this.data[mappedPos][key] = {
                synsetOffset,
                ssType,
                words,
                pointers,
                def,
                examples
            };
        }
    }

    lookup(word, pos = null) {
        this.load();
        
        const results = [];
        const wordLower = word.toLowerCase().replace(/ /g, '_');
        
        const posList = pos ? [pos] : ['noun', 'verb', 'adj', 'adv'];
        
        for (const p of posList) {
            const key = `${wordLower}.${p.charAt(0)}`;
            const idx = this.index[p][key];
            
            if (idx) {
                const synsets = this.getSynsets(idx, p);
                for (const synset of synsets) {
                    results.push({
                        lemma: wordLower,
                        pos: p,
                        synsetOffset: synset.synsetOffset,
                        def: synset.def,
                        examples: synset.examples,
                        words: synset.words.map(w => w.word),
                        pointers: this.formatPointers(synset.pointers)
                    });
                }
            }
        }
        
        return results;
    }

    getSynsets(idx, pos) {
        const results = [];
        const synsetType = idx.posCode || pos.charAt(0);
        const mappedPos = this.posMap[synsetType] || pos;
        
        for (const sense of idx.senses) {
            const offsetStr = sense.synsetOffset;
            // Parse as number and format as: offset.ssType (e.g., "5926236.n")
            const offsetNum = parseInt(offsetStr, 10);
            const key = `${offsetNum}.${synsetType}`;
            
            const synset = this.data[mappedPos][key];
            if (synset) results.push(synset);
        }
        
        return results;
    }

    formatPointers(pointers) {
        const ptrNames = {
            '@': 'hypernym',
            '~': 'hyponym',
            '#': 'member_holonym',
            '*': 'member_meronym',
            '=': 'attribute',
            '+': 'derivationally_related',
            ';': 'domain',
            '-': 'member',
            '>': 'cause',
            '^': 'entailment',
            '&': 'similar',
            '<': 'participle',
            '\\': 'pertainym'
        };
        
        return pointers.map(p => ({
            type: ptrNames[p.ptr] || p.ptr,
            target: p.synsetOffset
        }));
    }

    getHypernyms(word, pos = 'noun') {
        const results = this.lookup(word, pos);
        const hypernyms = [];
        
        for (const result of results) {
            for (const ptr of result.pointers) {
                if (ptr.type === 'hypernym') {
                    const key = `${String(ptr.target).padStart(8, '0')}.${pos.charAt(0)}`;
                    const synset = this.data[pos.charAt(0)][key];
                    if (synset) {
                        hypernyms.push({
                            synsetOffset: synset.synsetOffset,
                            def: synset.def,
                            words: synset.words.map(w => w.word)
                        });
                    }
                }
            }
        }
        
        return hypernyms;
    }

    similarity(word1, word2, pos = 'noun') {
        const synsets1 = this.lookup(word1, pos);
        const synsets2 = this.lookup(word2, pos);
        
        let maxSim = 0;
        
        for (const s1 of synsets1) {
            const path1 = this.getHypernymPath(s1.synsetOffset, pos);
            
            for (const s2 of synsets2) {
                const path2 = this.getHypernymPath(s2.synsetOffset, pos);
                
                const common = path1.filter(p => path2.includes(p));
                if (common.length === 0) continue;
                
                const sim = (2 * common.length) / (path1.length + path2.length);
                maxSim = Math.max(maxSim, sim);
            }
        }
        
        return maxSim;
    }

    getHypernymPath(offset, pos) {
        const path = [];
        const posChar = pos.charAt(0);
        const key = `${String(offset).padStart(8, '0')}.${posChar}`;
        
        let current = this.data[posChar][key];
        const visited = new Set();
        
        while (current && !visited.has(current.synsetOffset)) {
            visited.add(current.synsetOffset);
            path.push(current.synsetOffset);
            
            let found = false;
            for (const ptr of current.pointers) {
                if (ptr.type === 'hypernym') {
                    const nextKey = `${String(ptr.target).padStart(8, '0')}.${posChar}`;
                    current = this.data[posChar][nextKey];
                    found = true;
                    break;
                }
            }
            if (!found) break;
        }
        
        return path;
    }

    mapToFanoPoint(word) {
        const domains = {
            1: ['wisdom', 'knowledge', 'understanding', 'cognition', 'mind'],
            2: ['law', 'regulation', 'rule', 'order', 'commandment'],
            3: ['group', 'community', 'society', 'bond', 'union'],
            4: ['record', 'document', 'testimony', 'witness', 'scribe'],
            5: ['word', 'speech', 'language', 'voice', 'message'],
            6: ['beginning', 'origin', 'source', 'creation', 'first'],
            7: ['see', 'watch', 'observe', 'perceive', 'vision']
        };
        
        const results = this.lookup(word);
        const scores = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0, 7: 0 };
        
        for (const result of results) {
            const text = `${result.def} ${result.words.join(' ')}`.toLowerCase();
            
            for (const [point, keywords] of Object.entries(domains)) {
                for (const kw of keywords) {
                    if (text.includes(kw)) {
                        scores[point]++;
                    }
                }
            }
        }
        
        let bestPoint = 1;
        let bestScore = 0;
        
        for (const [point, score] of Object.entries(scores)) {
            if (score > bestScore) {
                bestScore = score;
                bestPoint = parseInt(point);
            }
        }
        
        return bestPoint;
    }
}

module.exports = new WordNetService();
