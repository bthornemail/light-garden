#!/usr/bin/env node
/**
 * Light Rendering CLI Tool
 * Test and validate light-rendering features
 */

const fs = require('fs');
const path = require('path');
const Adapter = require('../adapters/light-rendering-adapter');

function readNdjson(filePath) {
  return fs.readFileSync(filePath, 'utf8')
    .split('\n')
    .map(l => l.trim())
    .filter(Boolean)
    .map(l => JSON.parse(l));
}

class LightRenderingTool {
  constructor() {
    this.adapter = new Adapter();
    this.command = process.argv[2];
    this.base = path.join(__dirname, '..');
  }

  async run() {
    switch (this.command) {
      case 'test':
        await this.runTests();
        break;
      case 'golden':
        await this.showGolden();
        break;
      case 'negative':
        await this.showNegative();
        break;
      case 'coverage':
        await this.showCoverage();
        break;
      case 'help':
      default:
        this.showHelp();
    }
  }

  async runTests() {
    console.log('Running Light Rendering tests...\n');

    const golden = await this.adapter.runGoldenTests();
    const negative = await this.adapter.runNegativeTests();

    console.log('Golden Tests:');
    golden.forEach(t => console.log('  ' + (t.status === 'passed' ? 'OK' : 'PENDING') + ' ' + t.name));

    console.log('\nNegative Tests:');
    negative.forEach(t => console.log('  ' + (t.status === 'passed' ? 'OK' : 'PENDING') + ' ' + t.name));
  }

  async showGolden() {
    const traces = readNdjson(path.join(this.base, 'golden/light-rendering.golden.ndjson'));
    console.log(JSON.stringify(traces, null, 2));
  }

  async showNegative() {
    const traces = readNdjson(path.join(this.base, 'negative/light-rendering.negative.ndjson'));
    console.log(JSON.stringify(traces, null, 2));
  }

  async showCoverage() {
    const coverage = await this.adapter.getCoverage();
    console.log(JSON.stringify(coverage, null, 2));
  }

  showHelp() {
    console.log(
      'Light Rendering CLI Tool\n\n' +
      'Usage:\n' +
      '  node light-rendering-tool.js <command>\n\n' +
      'Commands:\n' +
      '  test      Run all tests\n' +
      '  golden    Show golden traces\n' +
      '  negative  Show negative traces\n' +
      '  coverage  Show test coverage\n' +
      '  help      Show this help\n'
    );
  }
}

const tool = new LightRenderingTool();
tool.run().catch(console.error);
