#!/usr/bin/env node
const path = require('path');
const { writeNdjson, writeJson, now } = require('./lib');

const root = path.resolve(__dirname, '..');
const ts = now();

const golden = {
  'wordnet-lookup.ndjson': [
    { test: 'wordnet-lookup', node: 'wordnet-service', action: 'lookup', word: 'wisdom', expected_synsets: 5, timestamp: ts },
    { test: 'wordnet-synset', node: 'wordnet-service', action: 'get_synset', offset: 1234567, expected_words: ['wisdom', 'sapience'], timestamp: ts + 1000 },
    { test: 'wordnet-hypernyms', node: 'wordnet-service', action: 'hypernyms', word: 'wisdom', expected: ['content', 'cognition', 'knowledge'], timestamp: ts + 2000 },
    { test: 'wordnet-similarity', node: 'wordnet-service', action: 'similarity', word1: 'wisdom', word2: 'knowledge', expected_range: [0.7, 0.9], timestamp: ts + 3000 }
  ],
  'fano-encode.ndjson': [
    { test: 'fano-encode', node: 'fano-core', action: 'matrix_from_seed', seed: 9069010, expected_matrix: [0, 2, 1, 2, 2, 0, 2], timestamp: ts + 4000 },
    { test: 'fano-mnemonic', node: 'fano-core', action: 'seed_to_mnemonic', seed: 9069010, expected: 'observer-geometry-plane', timestamp: ts + 5000 },
    { test: 'fano-angle', node: 'fano-core', action: 'angle_to_seed', angle: 164.3, matrix: [0, 2, 1, 2, 2, 0, 2], expected_seed: 9069010, timestamp: ts + 6000 },
    { test: 'fano-rotation', node: 'fano-core', action: 'rotate_matrix', matrix: [0, 2, 1, 2, 2, 0, 2], rotation: 51.4, expected: [2, 0, 2, 1, 2, 2, 0], timestamp: ts + 7000 }
  ],
  'server-routes.ndjson': [
    { test: 'server-http', node: 'c-server', port: 8080, route: '/', expected_status: 200, expected_content: 'text/html', timestamp: ts + 8000 },
    { test: 'server-websocket', node: 'c-server', port: 8081, action: 'connect', expected_protocol: 'ws', timestamp: ts + 9000 },
    { test: 'server-api', node: 'wordnet-service', port: 4096, route: '/api/wordnet/lookup?word=wisdom', expected_status: 200, timestamp: ts + 10000 },
    { test: 'server-static', node: 'c-server', route: '/firmware.html', expected_file: 'public/fano-minimal.html', timestamp: ts + 11000 }
  ],
  'firmware-sensors.ndjson': [
    { test: 'firmware-probe', node: 'esp32', action: 'read_analog', pin: 0, expected_range: [0, 4095], timestamp: ts + 12000 },
    { test: 'firmware-fano', node: 'esp32', action: 'sensors_to_fano', analog: [1024, 2048, 3072, 4095], expected_matrix: [1, 2, 3, 0, 1, 2, 3], timestamp: ts + 13000 },
    { test: 'firmware-lora', node: 'esp32', action: 'send_packet', packet_size: 24, expected_delivery: true, timestamp: ts + 14000 },
    { test: 'firmware-led', node: 'esp32', action: 'set_led', index: 2, color: '#ff8800', brightness: 128, expected_current: '12mA', timestamp: ts + 15000 }
  ],
  'docs-links.ndjson': [
    { test: 'docs-files', node: 'documentation', action: 'count_md', expected: 24, timestamp: ts + 16000 },
    { test: 'docs-links', node: 'documentation', action: 'validate_links', expected_valid: true, timestamp: ts + 17000 },
    { test: 'docs-glossary', node: 'documentation', action: 'verify_terms', expected_terms: ['Fano', 'WordNet', 'NDJSON', 'ESP32'], timestamp: ts + 18000 },
    { test: 'docs-examples', node: 'documentation', action: 'validate_code_blocks', expected_executable: true, timestamp: ts + 19000 }
  ]
};

for (const [name, records] of Object.entries(golden)) {
  writeNdjson(path.join(root, 'traces', 'golden', name), records);
}

writeJson(path.join(root, 'artifacts', 'golden', 'wordnet-synsets.json'), {
  generated_at: ts,
  words: ['wisdom', 'knowledge', 'fano'],
  note: 'Golden baseline generated from framework inputs.'
});
writeJson(path.join(root, 'artifacts', 'golden', 'fano-matrices.json'), {
  generated_at: ts,
  samples: [{ seed: 9069010, matrix: [0, 2, 1, 2, 2, 0, 2], angle: 164.3 }]
});
writeJson(path.join(root, 'artifacts', 'golden', 'server-responses.json'), {
  generated_at: ts,
  routes: ['/', '/firmware.html', '/api/wordnet/lookup?word=wisdom']
});
writeJson(path.join(root, 'artifacts', 'golden', 'firmware-states.json'), {
  generated_at: ts,
  simulated: true,
  fields: ['analog', 'matrix', 'seed', 'fano_point']
});

console.log('Golden traces and baseline artifacts generated.');
