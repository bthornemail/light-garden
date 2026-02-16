const http = require('http');
const url = require('url');
const wordnet = require('./wordnet-service');
const { ArxivAdapter, WikipediaAdapter, USArchiveAdapter } = require('./document-adapters');

const PORT = 4096;

const arxivAdapter = new ArxivAdapter(wordnet);
const wikipediaAdapter = new WikipediaAdapter(wordnet);
const usArchiveAdapter = new USArchiveAdapter(wordnet);

const MIME_TYPES = {
    '.html': 'text/html',
    '.js': 'application/javascript',
    '.css': 'text/css',
    '.json': 'application/json',
    '.ndjson': 'application/x-ndjson'
};

function sendJSON(res, data, status = 200) {
    res.writeHead(status, {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type'
    });
    res.end(JSON.stringify(data));
}

function sendError(res, message, status = 500) {
    sendJSON(res, { error: message }, status);
}

const routes = {
    'GET /api/wordnet/lookup': (req, res, params) => {
        const word = params.word;
        if (!word) {
            return sendError(res, 'Missing word parameter', 400);
        }
        
        const pos = params.pos || null;
        const results = wordnet.lookup(word, pos);
        sendJSON(res, results);
    },
    
    'GET /api/wordnet/hypernyms': (req, res, params) => {
        const word = params.word;
        if (!word) {
            return sendError(res, 'Missing word parameter', 400);
        }
        
        const pos = params.pos || 'noun';
        const hypernyms = wordnet.getHypernyms(word, pos);
        sendJSON(res, hypernyms);
    },
    
    'GET /api/wordnet/similarity': (req, res, params) => {
        const word1 = params.word1;
        const word2 = params.word2;
        
        if (!word1 || !word2) {
            return sendError(res, 'Missing word1 or word2 parameter', 400);
        }
        
        const pos = params.pos || 'noun';
        const sim = wordnet.similarity(word1, word2, pos);
        sendJSON(res, { word1, word2, pos, similarity: sim });
    },
    
    'GET /api/wordnet/fano': (req, res, params) => {
        const word = params.word;
        if (!word) {
            return sendError(res, 'Missing word parameter', 400);
        }
        
        const point = wordnet.mapToFanoPoint(word);
        const fanoNames = ['?', 'Wisdom', 'Law', 'Cohesion', 'Witness', 'Voice', 'Genesis', 'Observer'];
        const fanoHues = [0, 240, 120, 60, 30, 180, 270, 150];
        
        sendJSON(res, {
            word,
            fanoPoint: point,
            fanoName: fanoNames[point],
            hue: fanoHues[point]
        });
    },
    
    'GET /api/wordnet/index': (req, res, params) => {
        wordnet.load();
        
        const index = {};
        for (const pos of ['noun', 'verb', 'adj', 'adv']) {
            index[pos] = Object.keys(wordnet.index[pos]).length;
        }
        
        sendJSON(res, index);
    },
    
    'POST /api/wordnet/mnemonic': async (req, res) => {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', () => {
            try {
                const { concept } = JSON.parse(body);
                if (!concept) {
                    return sendError(res, 'Missing concept parameter', 400);
                }
                
                const results = wordnet.lookup(concept);
                const related = new Set();
                
                for (const r of results) {
                    for (const ptr of r.pointers) {
                        if (ptr.type === 'hypernym' || ptr.type === 'hyponym') {
                            const key = `${String(ptr.target).padStart(8, '0')}.${r.pos.charAt(0)}`;
                            const synset = wordnet.data[r.pos.charAt(0)][key];
                            if (synset) {
                                synset.words.forEach(w => related.add(w.word));
                            }
                        }
                    }
                }
                
                const words = Array.from(related).slice(0, 12);
                const matrix = [];
                for (let i = 0; i < 7; i++) {
                    const word = words[i % words.length] || 'void';
                    matrix[i] = word.length % 4;
                }
                
                sendJSON(res, {
                    mnemonic: words.join(' '),
                    matrix,
                    angle: (words.length * 51.428) % 360,
                    fanoPoint: wordnet.mapToFanoPoint(concept)
                });
            } catch (e) {
                sendError(res, e.message);
            }
        });
    },
    
    'GET /api/arxiv/:id': async (req, res, params) => {
        try {
            const paper = await arxivAdapter.fetchPaper(params.id);
            const encoded = await arxivAdapter.encodePaper(paper);
            sendJSON(res, encoded);
        } catch (e) {
            sendError(res, e.message);
        }
    },
    
    'GET /api/wikipedia/:title': async (req, res, params) => {
        try {
            const article = await wikipediaAdapter.fetchArticle(params.title);
            sendJSON(res, article);
        } catch (e) {
            sendError(res, e.message);
        }
    },
    
    'GET /api/archive/:id': async (req, res, params) => {
        try {
            const item = await usArchiveAdapter.fetchItem(params.id);
            sendJSON(res, item);
        } catch (e) {
            sendError(res, e.message);
        }
    },
    
    'POST /api/document/encode': async (req, res) => {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', async () => {
            try {
                const { source, id, title } = JSON.parse(body);
                let encoded;
                
                if (source === 'arxiv') {
                    const paper = await arxivAdapter.fetchPaper(id);
                    encoded = await arxivAdapter.encodePaper(paper);
                } else if (source === 'wikipedia') {
                    encoded = await wikipediaAdapter.fetchArticle(title || id);
                } else if (source === 'archive') {
                    const item = await usArchiveAdapter.fetchItem(id);
                    encoded = await usArchiveAdapter.encodeMetadata(item);
                } else {
                    return sendError(res, 'Unknown source', 400);
                }
                
                sendJSON(res, encoded);
            } catch (e) {
                sendError(res, e.message);
            }
        });
    }
};

function route(req, res) {
    const parsed = url.parse(req.url, true);
    const pathname = parsed.pathname;
    const params = parsed.query;
    
    if (pathname === '/favicon.ico') {
        res.writeHead(204);
        res.end();
        return;
    }
    
    console.log(`${req.method} ${pathname}`);
    
    if (pathname.startsWith('/api/wordnet/') || pathname.startsWith('/api/arxiv/') || pathname.startsWith('/api/wikipedia/') || pathname.startsWith('/api/archive/')) {
        for (const [key, handler] of Object.entries(routes)) {
            const [method, pattern] = key.split(' ');
            
            if (req.method !== method) continue;
            
            if (pattern.includes(':')) {
                const patternParts = pattern.split('/');
                const pathParts = pathname.split('/');
                
                if (patternParts.length !== pathParts.length) continue;
                
                const matchParams = {};
                let matched = true;
                
                for (let i = 0; i < patternParts.length; i++) {
                    if (patternParts[i].startsWith(':')) {
                        matchParams[patternParts[i].slice(1)] = pathParts[i];
                    } else if (patternParts[i] !== pathParts[i]) {
                        matched = false;
                        break;
                    }
                }
                
                if (matched) {
                    console.log(`Matched route: ${key} with params:`, matchParams);
                    return handler(req, res, { ...params, ...matchParams });
                }
            } else if (pattern === pathname) {
                return handler(req, res, params);
            }
        }
        
        return sendError(res, 'Not found', 404);
    }
    
    sendError(res, 'Not found', 404);
}

const server = http.createServer(route);

server.listen(PORT, () => {
    console.log(`WordNet API server running on port ${PORT}`);
    console.log('Endpoints:');
    console.log('  GET  /api/wordnet/lookup/:word');
    console.log('  GET  /api/wordnet/hypernyms/:word');
    console.log('  GET  /api/wordnet/similarity/:word1/:word2');
    console.log('  GET  /api/wordnet/fano/:word');
    console.log('  POST /api/wordnet/mnemonic');
});
