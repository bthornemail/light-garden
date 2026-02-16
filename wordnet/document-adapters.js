const https = require('https');
const http = require('http');

function fetchJSON(url, headers = {}) {
    return new Promise((resolve, reject) => {
        const client = url.startsWith('https') ? https : http;
        const options = { headers };
        const req = client.get(url, options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    resolve(JSON.parse(data));
                } catch (e) {
                    reject(new Error(`JSON parse error: ${data.substring(0, 200)}`));
                }
            });
        }).on('error', reject);
    });
}

class ArxivAdapter {
    constructor(wordnetService) {
        this.wn = wordnetService;
        this.baseUrl = 'https://export.arxiv.org/api/query';
    }

    async fetchPaper(arxivId) {
        const url = `${this.baseUrl}?id_list=${arxivId}`;
        const xml = await this.fetchXML(url);
        return this.parseArxivXML(xml, arxivId);
    }

    fetchXML(url) {
        return new Promise((resolve, reject) => {
            https.get(url, (res) => {
                let data = '';
                res.on('data', chunk => data += chunk);
                res.on('end', () => resolve(data));
            }).on('error', reject);
        });
    }

    parseArxivXML(xml, arxivId) {
        const getTag = (tag) => {
            const match = xml.match(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`);
            return match ? match[1].trim() : '';
        };

        const title = getTag('title').replace(/\n/g, ' ');
        const summary = getTag('summary').replace(/\n/g, ' ');
        const authors = [];
        let authorMatch;
        const authorRegex = /<author>\s*<name>([^<]+)<\/name>/g;
        while ((authorMatch = authorRegex.exec(xml)) !== null) {
            authors.push(authorMatch[1]);
        }

        const categories = [];
        let catMatch;
        const catRegex = /<category[^>]*term="([^"]+)"/g;
        while ((catMatch = catRegex.exec(xml)) !== null) {
            categories.push(catMatch[1]);
        }

        const published = getTag('published');

        return { id: arxivId, title, summary, authors, categories, published };
    }

    async encodePaper(paper) {
        const text = `${paper.title} ${paper.summary}`;
        const words = text.toLowerCase().split(/\W+/).filter(w => w.length > 3);
        const uniqueWords = [...new Set(words)].slice(0, 20);

        const synsets = [];
        for (const word of uniqueWords) {
            const results = this.wn.lookup(word);
            if (results.length) {
                synsets.push({ term: word, synset: results[0] });
            }
        }

        const matrix = [];
        for (let i = 0; i < 7; i++) {
            const synset = synsets[i % synsets.length];
            matrix[i] = synset ? (synset.synset.synsetOffset % 4) : 0;
        }

        const date = new Date(paper.published);
        const dayOfYear = Math.floor((date - new Date(date.getFullYear(), 0, 0)) / (1000 * 60 * 60 * 24));
        const angle = (dayOfYear / 365) * 360;

        return {
            source: 'arXiv',
            id: paper.id,
            title: paper.title,
            matrix,
            angle,
            seed: this.matrixToSeed(matrix, angle),
            synsets: synsets.slice(0, 7),
            fanoPoint: this.calculateFanoPoint(synsets)
        };
    }

    matrixToSeed(matrix, angle) {
        let bits = 0;
        for (let i = 0; i < 7; i++) {
            bits |= (matrix[i] << (i * 2));
        }
        const angleBits = Math.floor(angle / 360 * 1023) & 0x3FF;
        return (bits << 10) | angleBits;
    }

    calculateFanoPoint(synsets) {
        const domains = {
            1: ['cognition', 'knowledge', 'mind', 'thinking'],
            2: ['wisdom', 'understanding', 'insight'],
            3: ['law', 'rule', 'order', 'system'],
            4: ['group', 'community', 'society', 'together'],
            5: ['record', 'write', 'document', 'text'],
            6: ['speak', 'word', 'language', 'voice'],
            7: ['begin', 'origin', 'create', 'first']
        };
        const scores = {1:0,2:0,3:0,4:0,5:0,6:0,7:0};
        
        for (const {synset} of synsets) {
            const gloss = (synset.def || '').toLowerCase();
            for (const [point, keywords] of Object.entries(domains)) {
                for (const kw of keywords) {
                    if (gloss.includes(kw)) scores[point]++;
                }
            }
        }
        
        return parseInt(Object.entries(scores).sort((a,b) => b[1]-a[1])[0][0]);
    }
}

class WikipediaAdapter {
    constructor(wordnetService) {
        this.wn = wordnetService;
        this.baseUrl = 'https://en.wikipedia.org/api/rest_v1';
        this.headers = {
            'User-Agent': 'FanoGarden/1.0 (https://github.com/fano-garden)'
        };
    }

    async fetchArticle(title) {
        const url = `${this.baseUrl}/page/summary/${encodeURIComponent(title)}`;
        const article = await fetchJSON(url, this.headers);
        return this.encodeArticle(article);
    }

    async encodeArticle(article) {
        const text = `${article.title} ${article.extract || ''}`;
        const words = text.toLowerCase().split(/\W+/).filter(w => w.length > 3);
        const uniqueWords = [...new Set(words)].slice(0, 20);

        const synsets = [];
        for (const word of uniqueWords) {
            const results = this.wn.lookup(word);
            if (results.length) {
                synsets.push({ term: word, synset: results[0] });
            }
        }

        const matrix = [];
        for (let i = 0; i < 7; i++) {
            const synset = synsets[i % synsets.length];
            matrix[i] = synset ? (synset.synset.synsetOffset % 4) : 0;
        }

        const angle = (article.pageid % 360);

        const triples = [];
        for (let i = 0; i < synsets.length - 2; i += 3) {
            triples.push({
                subject: synsets[i]?.term,
                predicate: 'relates_to',
                object: synsets[i+1]?.term
            });
        }

        return {
            source: 'Wikipedia',
            id: article.pageid,
            title: article.title,
            extract: article.extract,
            matrix,
            angle,
            seed: this.matrixToSeed(matrix, angle),
            synsets: synsets.slice(0, 7),
            triples,
            fanoPoint: this.calculateFanoPoint(synsets)
        };
    }

    matrixToSeed(matrix, angle) {
        let bits = 0;
        for (let i = 0; i < 7; i++) {
            bits |= (matrix[i] << (i * 2));
        }
        const angleBits = Math.floor(angle / 360 * 1023) & 0x3FF;
        return (bits << 10) | angleBits;
    }

    calculateFanoPoint(synsets) {
        const domains = {
            1: ['cognition', 'knowledge', 'mind', 'thinking'],
            2: ['wisdom', 'understanding', 'insight'],
            3: ['law', 'rule', 'order', 'system'],
            4: ['group', 'community', 'society', 'together'],
            5: ['record', 'write', 'document', 'text'],
            6: ['speak', 'word', 'language', 'voice'],
            7: ['begin', 'origin', 'create', 'first']
        };
        const scores = {1:0,2:0,3:0,4:0,5:0,6:0,7:0};
        
        for (const {synset} of synsets) {
            const gloss = (synset.def || '').toLowerCase();
            for (const [point, keywords] of Object.entries(domains)) {
                for (const kw of keywords) {
                    if (gloss.includes(kw)) scores[point]++;
                }
            }
        }
        
        return parseInt(Object.entries(scores).sort((a,b) => b[1]-a[1])[0][0]);
    }
}

class USArchiveAdapter {
    constructor(wordnetService) {
        this.wn = wordnetService;
        this.baseUrl = 'https://archive.org/metadata';
    }

    async fetchItem(identifier) {
        const url = `${this.baseUrl}/${identifier}`;
        const metadata = await fetchJSON(url);
        return this.encodeMetadata(metadata);
    }

    async encodeMetadata(metadata) {
        const fields = [
            metadata.title,
            metadata.description,
            metadata.subject,
            metadata.creator
        ].filter(Boolean).join(' ');

        const words = fields.toLowerCase().split(/\W+/).filter(w => w.length > 3);
        const uniqueWords = [...new Set(words)].slice(0, 20);

        const synsets = [];
        for (const word of uniqueWords) {
            const results = this.wn.lookup(word);
            if (results.length) {
                synsets.push({ term: word, synset: results[0] });
            }
        }

        const matrix = [];
        for (let i = 0; i < 7; i++) {
            const synset = synsets[i % synsets.length];
            matrix[i] = synset ? (synset.synset.synsetOffset % 4) : 0;
        }

        const angle = ((metadata.files?.length || 0) * 7) % 360;

        return {
            source: 'US Archive',
            id: metadata.metadata?.identifier,
            title: metadata.title,
            matrix,
            angle,
            seed: this.matrixToSeed(matrix, angle),
            synsets: synsets.slice(0, 7),
            fanoPoint: this.calculateFanoPoint(synsets)
        };
    }

    matrixToSeed(matrix, angle) {
        let bits = 0;
        for (let i = 0; i < 7; i++) {
            bits |= (matrix[i] << (i * 2));
        }
        const angleBits = Math.floor(angle / 360 * 1023) & 0x3FF;
        return (bits << 10) | angleBits;
    }

    calculateFanoPoint(synsets) {
        const domains = {
            1: ['cognition', 'knowledge', 'mind', 'thinking'],
            2: ['wisdom', 'understanding', 'insight'],
            3: ['law', 'rule', 'order', 'system'],
            4: ['group', 'community', 'society', 'together'],
            5: ['record', 'write', 'document', 'text'],
            6: ['speak', 'word', 'language', 'voice'],
            7: ['begin', 'origin', 'create', 'first']
        };
        const scores = {1:0,2:0,3:0,4:0,5:0,6:0,7:0};
        
        for (const {synset} of synsets) {
            const gloss = (synset.def || '').toLowerCase();
            for (const [point, keywords] of Object.entries(domains)) {
                for (const kw of keywords) {
                    if (gloss.includes(kw)) scores[point]++;
                }
            }
        }
        
        return parseInt(Object.entries(scores).sort((a,b) => b[1]-a[1])[0][0]);
    }
}

module.exports = { ArxivAdapter, WikipediaAdapter, USArchiveAdapter };
