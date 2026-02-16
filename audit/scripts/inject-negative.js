#!/usr/bin/env node
const path = require('path');
const { writeNdjson, writeJson, now } = require('./lib');

const root = path.resolve(__dirname, '..');
const ts = now();

const negative = {
  'wordnet-errors.ndjson': [
    { test: 'wordnet-nonexistent', node: 'wordnet-service', action: 'lookup', word: 'xyzabc123', expected_error: 'NOT_FOUND', timestamp: ts },
    { test: 'wordnet-malformed', node: 'wordnet-service', action: 'lookup', word: '', expected_error: 'INVALID_INPUT', timestamp: ts + 1000 },
    { test: 'wordnet-injection', node: 'wordnet-service', action: 'lookup', word: "'; DROP TABLE synsets; --", expected_error: 'SAFE', timestamp: ts + 2000, note: 'Must be sanitized; never executed.' },
    { test: 'wordnet-timeout', node: 'wordnet-service', action: 'lookup', word: 'wisdom', delay_ms: 5000, expected_timeout: true, timestamp: ts + 3000 }
  ],
  'fano-boundaries.ndjson': [
    { test: 'fano-invalid-matrix', node: 'fano-core', action: 'encode', matrix: [0, 2, 1, 2, 2, 0, 8], expected_error: 'INVALID_QUADRANT', timestamp: ts + 4000 },
    { test: 'fano-angle-outside', node: 'fano-core', action: 'encode', matrix: [0, 2, 1, 2, 2, 0, 2], angle: 450, expected_error: 'ANGLE_RANGE', timestamp: ts + 5000 },
    { test: 'fano-seed-overflow', node: 'fano-core', action: 'seed_to_matrix', seed: 16777216, expected_error: 'SEED_RANGE', timestamp: ts + 6000 },
    { test: 'fano-point-outside', node: 'fano-core', action: 'point_details', point: 9, expected_error: 'POINT_RANGE', timestamp: ts + 7000 }
  ],
  'server-attacks.ndjson': [
    { test: 'server-path-traversal', node: 'c-server', route: '/../../etc/passwd', expected_status: 403, timestamp: ts + 8000 },
    { test: 'server-large-payload', node: 'wordnet-service', route: '/api/wordnet/lookup', payload_size_mb: 100, expected_status: 413, timestamp: ts + 9000 },
    { test: 'server-rate-limit', node: 'c-server', route: '/', requests_per_second: 1000, expected_limit: 100, timestamp: ts + 10000 },
    { test: 'server-websocket-flood', node: 'c-server', port: 8081, messages_per_second: 10000, expected_disconnect: true, timestamp: ts + 11000 }
  ],
  'firmware-faults.ndjson': [
    { test: 'firmware-sensor-fail', node: 'esp32', action: 'read_analog', pin: 99, expected_error: 'INVALID_PIN', timestamp: ts + 12000 },
    { test: 'firmware-power-loss', node: 'esp32', action: 'simulate_brownout', voltage: 3.0, expected_reset: true, timestamp: ts + 13000 },
    { test: 'firmware-lora-collision', node: 'esp32', action: 'send_packet', concurrent_nodes: 10, expected_collision_rate: 0.3, timestamp: ts + 14000 },
    { test: 'firmware-memory-leak', node: 'esp32', action: 'loop_iterations', count: 10000, expected_heap_stable: true, timestamp: ts + 15000 }
  ],
  'docs-broken.ndjson': [
    { test: 'docs-missing-file', node: 'documentation', action: 'check_file', path: 'docs/nonexistent.md', expected_exists: false, timestamp: ts + 16000 },
    { test: 'docs-broken-link', node: 'documentation', action: 'check_links', url: 'https://nonexistent.example.com', expected_broken: true, timestamp: ts + 17000 },
    { test: 'docs-orphaned-page', node: 'documentation', action: 'check_navigation', page: 'docs/old-page.md', expected_in_nav: false, timestamp: ts + 18000 },
    { test: 'docs-spelling', node: 'documentation', action: 'spell_check', expected_errors: 0, timestamp: ts + 19000 }
  ]
};

for (const [name, records] of Object.entries(negative)) {
  writeNdjson(path.join(root, 'traces', 'negative', name), records);
}

writeJson(path.join(root, 'artifacts', 'negative', 'error-codes.json'), {
  generated_at: ts,
  codes: [400, 403, 404, 413, 422, 'timeout']
});
writeJson(path.join(root, 'artifacts', 'negative', 'stack-traces.json'), {
  generated_at: ts,
  traces: []
});
writeJson(path.join(root, 'artifacts', 'negative', 'edge-cases.json'), {
  generated_at: ts,
  notes: ['invalid matrices', 'oversized payloads', 'nonexistent words']
});

console.log('Negative traces and baseline failure artifacts generated.');
