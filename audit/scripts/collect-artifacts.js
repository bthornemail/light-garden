#!/usr/bin/env node
const path = require('path');
const { writeJson, requestJson, requestText, now, ensureDir } = require('./lib');

const root = path.resolve(__dirname, '..');

async function collect() {
  const ts = now();
  ensureDir(path.join(root, 'artifacts', 'golden'));
  ensureDir(path.join(root, 'artifacts', 'negative'));
  ensureDir(path.join(root, 'results', 'latest'));

  const wordnet = await requestJson('http://localhost:4096/api/wordnet/lookup/wisdom');
  const cHttp = await requestText('http://localhost:8080/');
  const cFirmware = await requestText('http://localhost:8080/firmware.html');

  const golden = {
    timestamp: ts,
    wordnet: {
      reachable: wordnet.ok,
      status: wordnet.status,
      sample_size: Array.isArray(wordnet.data) ? wordnet.data.length : 0
    },
    server: {
      reachable: cHttp.ok,
      status: cHttp.status,
      firmware_page: cFirmware.ok
    },
    firmware: {
      simulated: true,
      nodes: 0,
      note: 'Hardware state collection is simulated in host audit mode.'
    }
  };

  const negative = {
    timestamp: ts,
    error_codes: [400, 403, 404, 413, 422],
    stack_traces: [],
    edge_cases: ['empty word', 'invalid matrix', 'oversized payload', 'bad path']
  };

  writeJson(path.join(root, 'artifacts', 'golden', 'server-responses.json'), golden.server);
  writeJson(path.join(root, 'artifacts', 'golden', 'wordnet-synsets.json'), golden.wordnet);
  writeJson(path.join(root, 'artifacts', 'golden', 'firmware-states.json'), golden.firmware);
  writeJson(path.join(root, 'artifacts', 'negative', 'error-codes.json'), { codes: negative.error_codes });
  writeJson(path.join(root, 'artifacts', 'negative', 'stack-traces.json'), { traces: negative.stack_traces });
  writeJson(path.join(root, 'artifacts', 'negative', 'edge-cases.json'), { cases: negative.edge_cases });

  writeJson(path.join(root, 'results', 'latest', 'metrics.json'), {
    timestamp: ts,
    probes: {
      wordnet_ok: wordnet.ok,
      server_ok: cHttp.ok,
      firmware_page_ok: cFirmware.ok
    }
  });

  console.log('Artifacts collected.');
}

collect().catch((err) => {
  console.error(err.stack || String(err));
  process.exit(1);
});
