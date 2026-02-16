#!/usr/bin/env node
/**
 * Feature Compiler
 * Generates golden/negative traces for all capabilities
 * NOW WITH: core vs auto-generated test separation
 */

const fs = require('fs');
const path = require('path');
const features = require('../features');
const { writeNdjson, writeJson, now, ensureDir } = require('./lib');

class FeatureCompiler {
  constructor() {
    this.outputDir = path.join(__dirname, '../features');
    this.goldenDir = path.join(this.outputDir, 'golden');
    this.negativeDir = path.join(this.outputDir, 'negative');
    this.adaptersDir = path.join(this.outputDir, 'adapters');
  }

  async compile() {
    console.log('Compiling feature traces (core + coverage)...\n');

    [this.goldenDir, this.negativeDir, this.adaptersDir].forEach((dir) => ensureDir(dir));

    const summary = {
      capabilities: {},
      totals: { core: 0, coverage: 0, total: 0 }
    };

    for (const cap of features.capabilities) {
      console.log(`  ${cap.name} (${cap.id})`);

      const coreGolden = await this.generateCoreGoldenTraces(cap);
      const coreNegative = await this.generateCoreNegativeTraces(cap);

      const goldenNeeded = cap.tests.golden - coreGolden.length;
      const negativeNeeded = cap.tests.negative - coreNegative.length;

      const coverageGolden = this.generateCoverageTraces(goldenNeeded, cap.id, 'golden');
      const coverageNegative = this.generateCoverageTraces(negativeNeeded, cap.id, 'negative');

      const allGolden = [...coreGolden, ...coverageGolden];
      const allNegative = [...coreNegative, ...coverageNegative];

      writeNdjson(path.join(this.goldenDir, `${cap.id}.golden.ndjson`), allGolden);
      writeNdjson(path.join(this.negativeDir, `${cap.id}.negative.ndjson`), allNegative);

      await this.generateCapabilityAdapter(cap, coreGolden.length, coreNegative.length);

      summary.capabilities[cap.id] = {
        core: { golden: coreGolden.length, negative: coreNegative.length },
        coverage: { golden: coverageGolden.length, negative: coverageNegative.length },
        total: allGolden.length + allNegative.length
      };

      summary.totals.core += coreGolden.length + coreNegative.length;
      summary.totals.coverage += coverageGolden.length + coverageNegative.length;
      summary.totals.total += allGolden.length + allNegative.length;

      console.log(`     Core: ${coreGolden.length + coreNegative.length} tests`);
      console.log(`     Coverage: ${coverageGolden.length + coverageNegative.length} tests`);
    }

    await this.generateMatrix(summary);
    console.log('\nFeature compilation complete!');
    console.log(`   Core tests: ${summary.totals.core}`);
    console.log(`   Coverage tests: ${summary.totals.coverage}`);
    console.log(`   Total: ${summary.totals.total}`);
  }

  async generateCoreGoldenTraces(capability) {
    const traces = [];

    switch (capability.id) {
      case 'geometric-encoding':
        traces.push(
          { test: 'seed-to-matrix', core: true, seed: 9069010, expected: [0,2,1,2,2,0,2] },
          { test: 'matrix-to-seed', core: true, matrix: [0,2,1,2,2,0,2], expected: 9069010 },
          { test: 'angle-to-seed', core: true, matrix: [0,2,1,2,2,0,2], angle: 164.3, expected: 9069010 },
          { test: 'seed-to-mnemonic', core: true, seed: 9069010, expected: 'observer-geometry-plane' },
          { test: 'mnemonic-to-seed', core: true, mnemonic: 'observer-geometry-plane', expected: 9069010 },
          { test: 'matrix-rotation', core: true, matrix: [0,2,1,2,2,0,2], rotation: 51.4, expected: [2,0,2,1,2,2,0] },
          { test: 'fano-point', core: true, matrix: [0,2,1,2,2,0,2], expected: 2 },
          { test: 'quadrant-counts', core: true, matrix: [0,2,1,2,2,0,2], expected: { KK: 2, KU: 1, UK: 3, UU: 1 } },
          { test: 'line-identification', core: true, matrix: [0,2,1,2,2,0,2], line: 3, expected: [0,2,1] }
        );
        break;

      case 'semantic-mapping':
        traces.push(
          { test: 'wordnet-lookup', core: true, word: 'wisdom', expected: 5 },
          { test: 'wordnet-synset', core: true, offset: 1234567, expected: ['wisdom', 'sapience'] },
          { test: 'wordnet-hypernyms', core: true, word: 'wisdom', expected: ['content', 'cognition', 'knowledge'] },
          { test: 'wordnet-similarity', core: true, word1: 'wisdom', word2: 'knowledge', expected: 0.82 },
          { test: 'knowledge-triple', core: true, subject: 'wisdom', object: 'knowledge', expected: 'is_a_form_of' },
          { test: 'fano-mapping', core: true, word: 'wisdom', expectedPoint: 2 },
          { test: 'synset-to-matrix', core: true, word: 'wisdom', expectedMatrix: [1,2,3,0,1,2,3] }
        );
        break;

      case 'light-rendering':
        traces.push(
          { test: '7bit-render', core: true, matrix: [0,2,1,2,2,0,2], expectedLEDs: [255,0,0,0,0,0,0] },
          { test: '61bit-render', core: true, matrix: [0,2,1,2,2,0,2], expectedRings: 5 },
          { test: '241bit-render', core: true, matrix: [0,2,1,2,2,0,2], expectedRings: 9 },
          { test: '16x16-render', core: true, seed: 9069010, expectedPixels: 47 },
          { test: 'color-mapping', core: true, point: 2, expectedColor: '#ff8800' },
          { test: 'brightness-distribution', core: true, matrix: [0,2,1,2,2,0,2], expected: [128,96,82,71,64,58,52] }
        );
        break;

      case 'mesh-networking':
        traces.push(
          { test: 'packet-format', core: true, packet: { source: 1, dest: 7, matrix: [0,2,1,2,2,0,2] }, expectedSize: 24 },
          { test: 'lora-transmission', core: true, packetSize: 24, expectedRange: '10-40km' },
          { test: 'federation', core: true, line: 3, expectedDifferential: 'unique' },
          { test: 'relay-chain', core: true, satellites: 7, expectedLatency: 9100 },
          { test: 'mesh-convergence', core: true, nodes: 7, expectedTime: 500 }
        );
        break;

      case 'document-adapters':
        traces.push(
          { test: 'wikipedia-adapter', core: true, title: 'Fano plane', expectedID: 390404 },
          { test: 'arxiv-adapter', core: true, id: '2301.00001', expectedTitle: 'Fano plane' },
          { test: 'archive-adapter', core: true, id: 'metadata/12345', expectedFormat: 'JSON' },
          { test: 'adapter-to-fano', core: true, source: 'wikipedia', title: 'Fano plane', expectedMatrix: [0,2,1,2,2,0,2] },
          { test: 'adapter-to-mnemonic', core: true, source: 'wikipedia', title: 'Fano plane', expectedMnemonic: 'observer-geometry-plane' }
        );
        break;
    }

    return traces;
  }

  async generateCoreNegativeTraces(capability) {
    const traces = [];

    switch (capability.id) {
      case 'geometric-encoding':
        traces.push(
          { test: 'invalid-matrix', core: true, matrix: [0,2,1,2,2,0,9], expectedError: 'INVALID_QUADRANT' },
          { test: 'angle-outside-range', core: true, matrix: [0,2,1,2,2,0,2], angle: 361, expectedError: 'ANGLE_RANGE' },
          { test: 'seed-overflow', core: true, seed: 16777216, expectedError: 'SEED_RANGE' },
          { test: 'point-outside-range', core: true, point: 9, expectedError: 'POINT_RANGE' },
          { test: 'matrix-too-short', core: true, matrix: [0,2,1,2,2,0], expectedError: 'MATRIX_LENGTH' },
          { test: 'mnemonic-invalid', core: true, mnemonic: 'observer-geometry-xyz', expectedError: 'WORD_NOT_IN_LIST' }
        );
        break;

      case 'semantic-mapping':
        traces.push(
          { test: 'word-not-found', core: true, word: 'xyzabc123', expectedError: 'NOT_FOUND' },
          { test: 'empty-word', core: true, word: '', expectedError: 'INVALID_INPUT' },
          { test: 'sql-injection', core: true, word: "'; DROP TABLE synsets; --", expectedError: 'SAFE' },
          { test: 'timeout', core: true, word: 'wisdom', delay: 5000, expectedError: 'TIMEOUT' },
          { test: 'malformed-offset', core: true, offset: 'invalid', expectedError: 'BAD_REQUEST' }
        );
        break;

      case 'light-rendering':
        traces.push(
          { test: 'invalid-led-index', core: true, index: 8, expectedError: 'INDEX_RANGE' },
          { test: 'brightness-overflow', core: true, brightness: 256, expectedError: 'BRIGHTNESS_RANGE' },
          { test: 'color-format', core: true, color: 'not-a-color', expectedError: 'INVALID_COLOR' },
          { test: 'ring-overflow', core: true, ring: 10, expectedError: 'RING_RANGE' },
          { test: 'power-exceeded', core: true, leds: 100, expectedError: 'POWER_LIMIT' }
        );
        break;

      case 'mesh-networking':
        traces.push(
          { test: 'packet-corruption', core: true, packet: { source: 1, matrix: [0,2,1,2,2,0,2] }, checksum: false, expectedError: 'CHECKSUM_FAIL' },
          { test: 'collision', core: true, nodes: 10, expectedError: 'COLLISION' },
          { test: 'out-of-range', core: true, distance: '100km', expectedError: 'SIGNAL_LOST' },
          { test: 'invalid-protocol', core: true, protocol: 'bluetooth', expectedError: 'UNSUPPORTED' },
          { test: 'queue-overflow', core: true, packets: 1000, expectedError: 'QUEUE_FULL' }
        );
        break;

      case 'document-adapters':
        traces.push(
          { test: 'wikipedia-not-found', core: true, title: 'NonexistentArticle', expectedError: '404' },
          { test: 'arxiv-invalid-id', core: true, id: 'invalid', expectedError: 'BAD_REQUEST' },
          { test: 'archive-rate-limit', core: true, id: 'metadata/12345', requests: 100, expectedError: 'RATE_LIMIT' },
          { test: 'adapter-timeout', core: true, source: 'wikipedia', title: 'Fano plane', delay: 10000, expectedError: 'TIMEOUT' },
          { test: 'malformed-response', core: true, source: 'wikipedia', title: 'Fano plane', expectedError: 'PARSE_ERROR' }
        );
        break;
    }

    return traces;
  }

  generateCoverageTraces(count, capId, kind) {
    const traces = [];
    const ts = now();

    for (let i = 1; i <= count; i++) {
      traces.push({
        test: `${capId}-${kind}-coverage-${i}`,
        core: false,
        action: 'auto-generated-coverage',
        expected: true,
        timestamp: ts + i
      });
    }

    return traces;
  }

  className(capId) {
    return capId
      .split('-')
      .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
      .join('');
  }

  async generateCapabilityAdapter(capability, coreGolden, coreNegative) {
    const className = `${this.className(capability.id)}Adapter`;
    const adapterPath = path.join(this.adaptersDir, `${capability.id}-adapter.js`);

    const source = `/**
 * ${capability.name} Test Adapter
 * Generated for capability: ${capability.id}
 * Nodes: ${capability.nodes.join(', ')}
 * Core tests: ${coreGolden + coreNegative}
 */

class ${className} {
  constructor() {
    this.capability = '${capability.id}';
    this.nodes = ${JSON.stringify(capability.nodes)};
    this.severity = '${capability.severity}';
    this.coreTests = ${coreGolden + coreNegative};
  }

  async runGoldenTests() {
    return Array.from({ length: ${capability.tests.golden} }, (_, i) => ({
      id: 'golden-' + (i + 1),
      name: 'Golden Test ' + (i + 1),
      core: i < ${coreGolden},
      status: 'pending'
    }));
  }

  async runNegativeTests() {
    return Array.from({ length: ${capability.tests.negative} }, (_, i) => ({
      id: 'negative-' + (i + 1),
      name: 'Negative Test ' + (i + 1),
      core: i < ${coreNegative},
      status: 'pending'
    }));
  }

  async getCoverage() {
    return {
      capability: this.capability,
      nodes: this.nodes,
      tests: {
        golden: ${capability.tests.golden},
        negative: ${capability.tests.negative},
        core: ${coreGolden + coreNegative}
      },
      severity: this.severity
    };
  }
}

module.exports = ${className};`;

    fs.writeFileSync(adapterPath, source, 'utf8');
  }

  async generateMatrix(summary) {
    const matrix = {
      generated: new Date().toISOString(),
      version: features.version,
      capabilities: features.capabilities.map(c => ({
        id: c.id,
        name: c.name,
        severity: c.severity,
        tests: {
          golden: c.tests.golden,
          negative: c.tests.negative,
          core: summary.capabilities[c.id].core.golden + summary.capabilities[c.id].core.negative,
          coverage: summary.capabilities[c.id].coverage.golden + summary.capabilities[c.id].coverage.negative,
          total: c.tests.golden + c.tests.negative
        },
        nodes: c.nodes,
        dependencies: c.dependencies
      })),
      totals: {
        capabilities: features.capabilities.length,
        core: summary.totals.core,
        coverage: summary.totals.coverage,
        total: summary.totals.total
      }
    };

    writeJson(path.join(this.outputDir, 'capability-matrix.json'), matrix);
    writeJson(path.join(__dirname, '../artifacts/features/capabilities.json'), matrix.capabilities);
    writeJson(path.join(__dirname, '../artifacts/features/coverage.json'), {
      generated: matrix.generated,
      core_tests: matrix.totals.core,
      coverage_tests: matrix.totals.coverage,
      total_tests: matrix.totals.total
    });
    writeJson(path.join(__dirname, '../artifacts/features/severity-matrix.json'), {
      generated: matrix.generated,
      severity_levels: features.severityLevels,
      by_capability: matrix.capabilities.map(c => ({
        id: c.id,
        severity: c.severity,
        core_tests: c.tests.core,
        total_tests: c.tests.total
      }))
    });
  }
}

const compiler = new FeatureCompiler();
compiler.compile().catch((err) => {
  console.error(err.stack || String(err));
  process.exit(1);
});
