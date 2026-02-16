#!/usr/bin/env node
const path = require('path');
const { spawnSync } = require('child_process');
const { writeJson, ensureDir, now } = require('./lib');

const root = path.resolve(__dirname, '..');

const suites = [
  { node: 'wordnet-service', trace: 'traces/golden/wordnet-lookup.ndjson', kind: 'golden' },
  { node: 'fano-core', trace: 'traces/golden/fano-encode.ndjson', kind: 'golden' },
  { node: 'c-server', trace: 'traces/golden/server-routes.ndjson', kind: 'golden' },
  { node: 'firmware', trace: 'traces/golden/firmware-sensors.ndjson', kind: 'golden' },
  { node: 'documentation', trace: 'traces/golden/docs-links.ndjson', kind: 'golden' },

  { node: 'wordnet-service', trace: 'traces/negative/wordnet-errors.ndjson', kind: 'negative' },
  { node: 'fano-core', trace: 'traces/negative/fano-boundaries.ndjson', kind: 'negative' },
  { node: 'c-server', trace: 'traces/negative/server-attacks.ndjson', kind: 'negative' },
  { node: 'firmware', trace: 'traces/negative/firmware-faults.ndjson', kind: 'negative' },
  { node: 'documentation', trace: 'traces/negative/docs-broken.ndjson', kind: 'negative' }
];

function runScript(script) {
  const p = spawnSync(process.execPath, [path.join(__dirname, script)], { cwd: root, encoding: 'utf8' });
  if (p.status !== 0) {
    throw new Error(`${script} failed: ${p.stderr || p.stdout}`);
  }
}

function runSuite(node, trace) {
  const p = spawnSync(process.execPath, [path.join(__dirname, 'validate-node.js'), '--node', node, '--trace', path.join(root, trace)], {
    cwd: root,
    encoding: 'utf8'
  });

  const txt = (p.stdout || '').trim();
  let payload;
  try {
    payload = JSON.parse(txt);
  } catch (_) {
    payload = {
      summary: { node, trace, total: 0, passed: 0, failed: 0, duration_ms: 0 },
      results: [{ test: 'runner-error', passed: false, detail: p.stderr || 'invalid validator output', duration_ms: 0, node }]
    };
  }
  return payload;
}

function genRecommendations(failures) {
  const rec = [];
  if (failures.some((f) => f.node === 'c-server')) rec.push('Harden C server input/path handling and add attack-path regression tests.');
  if (failures.some((f) => f.node === 'wordnet-service')) rec.push('Add stricter input validation and predictable error codes for WordNet endpoints.');
  if (failures.some((f) => f.node === 'firmware')) rec.push('Run hardware-in-loop validation for firmware traces (host mode is simulated).');
  if (failures.some((f) => f.node === 'documentation')) rec.push('Resolve broken docs checks and enforce link lint in CI.');
  if (rec.length === 0) rec.push('No critical gaps detected in current audit scope. Expand edge-case coverage.');
  return rec;
}

function main() {
  console.log('🔍 Light Garden Audit v1.0.0');
  console.log('==============================');

  ensureDir(path.join(root, 'artifacts', 'reports'));
  ensureDir(path.join(root, 'results', 'latest'));

  runScript('generate-golden.js');
  runScript('inject-negative.js');

  const perNode = {};
  const passed = [];
  const failed = [];
  let totals = { total: 0, passed: 0, failed: 0, warnings: 0 };
  let durationTotal = 0;

  for (const s of suites) {
    const res = runSuite(s.node, s.trace);
    durationTotal += res.summary.duration_ms || 0;

    if (!perNode[s.node]) perNode[s.node] = { golden: { passed: 0, failed: 0, total: 0 }, negative: { passed: 0, failed: 0, total: 0 } };
    perNode[s.node][s.kind] = {
      passed: res.summary.passed,
      failed: res.summary.failed,
      total: res.summary.total
    };

    totals.total += res.summary.total;
    totals.passed += res.summary.passed;
    totals.failed += res.summary.failed;

    for (const r of res.results) {
      const entry = { ...r, suite: s.kind, trace: s.trace };
      if (r.passed) passed.push(entry);
      else failed.push(entry);
    }

    const icon = res.summary.failed ? '⚠️' : '✅';
    console.log(`${icon} ${s.node} (${s.kind}): ${res.summary.passed}/${res.summary.total}`);
  }

  runScript('collect-artifacts.js');

  const coverage = {
    node_coverage: `${(Object.keys(perNode).length / 5 * 100).toFixed(1)}%`,
    golden_tests: suites.filter((s) => s.kind === 'golden').reduce((a, s) => a + perNode[s.node].golden.total, 0),
    negative_tests: suites.filter((s) => s.kind === 'negative').reduce((a, s) => a + perNode[s.node].negative.total, 0),
    edge_cases: suites.filter((s) => s.kind === 'negative').reduce((a, s) => a + perNode[s.node].negative.total, 0),
    api_coverage: 'N/A (dynamic; depends on running services)'
  };

  const report = {
    timestamp: now(),
    version: '1.0.0',
    summary: totals,
    coverage,
    node_results: perNode,
    failures: failed.map((f) => ({ node: f.node, test: f.test, error: f.detail, severity: 'medium' })),
    metrics: {
      avg_response_time_ms: totals.total ? Math.round(durationTotal / totals.total) : 0,
      p95_response_time_ms: 0,
      error_rate: totals.total ? `${((totals.failed / totals.total) * 100).toFixed(1)}%` : '0.0%',
      availability: 'N/A',
      test_duration_seconds: +(durationTotal / 1000).toFixed(2)
    },
    recommendations: genRecommendations(failed)
  };

  writeJson(path.join(root, 'artifacts', 'reports', 'audit-summary.json'), report);
  writeJson(path.join(root, 'artifacts', 'reports', 'coverage-matrix.json'), coverage);

  const recMd = ['# Audit Recommendations', ''];
  report.recommendations.forEach((r, i) => recMd.push(`${i + 1}. ${r}`));
  require('fs').writeFileSync(path.join(root, 'artifacts', 'reports', 'recommendations.md'), recMd.join('\n') + '\n', 'utf8');

  writeJson(path.join(root, 'results', 'latest', 'passed.json'), { count: passed.length, tests: passed });
  writeJson(path.join(root, 'results', 'latest', 'failed.json'), { count: failed.length, tests: failed });
  writeJson(path.join(root, 'results', 'latest', 'metrics.json'), report.metrics);

  console.log('');
  console.log('✅ Audit complete');
  console.log(`   Passed: ${totals.passed}`);
  console.log(`   Failed: ${totals.failed}`);
  console.log(`   Reports: ${path.join(root, 'artifacts', 'reports')}`);

  process.exit(totals.failed > 0 ? 1 : 0);
}

try {
  main();
} catch (err) {
  console.error(err.stack || String(err));
  process.exit(1);
}
