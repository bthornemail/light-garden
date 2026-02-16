#!/usr/bin/env node
/**
 * Fano Master CLI Tool
 * Run any feature test from one interface
 */

const { execSync } = require('child_process');
const path = require('path');
const features = require('../index');

class FanoMasterTool {
  constructor() {
    this.command = process.argv[2];
    this.subcommand = process.argv[3];
  }

  run() {
    switch (this.command) {
      case 'list':
        this.listCapabilities();
        break;
      case 'run':
        this.runCapability();
        break;
      case 'audit':
        this.runFullAudit();
        break;
      case 'help':
      default:
        this.showHelp();
    }
  }

  listCapabilities() {
    console.log('\nAvailable Capabilities:\n');
    features.capabilities.forEach((cap) => {
      console.log('  ' + cap.id.padEnd(20) + cap.name);
      console.log('  ' + ' '.repeat(20) + 'Severity: ' + cap.severity + ', Tests: ' + (cap.tests.golden + cap.tests.negative) + '\n');
    });
  }

  runCapability() {
    const cap = features.capabilities.find((c) => c.id === this.subcommand);
    if (!cap) {
      console.error('Unknown capability: ' + this.subcommand);
      process.exit(1);
    }

    console.log('\nRunning ' + cap.name + ' tests...\n');
    execSync('node ' + path.join(__dirname, cap.id + '-tool.js') + ' test', { stdio: 'inherit' });
  }

  runFullAudit() {
    console.log('Running full feature tool audit...\n');
    for (const cap of features.capabilities) {
      try {
        execSync('node ' + path.join(__dirname, cap.id + '-tool.js') + ' test', { stdio: 'inherit' });
      } catch (_) {
        // continue across capabilities
      }
      console.log('');
    }
  }

  showHelp() {
    console.log(
      '\nFano Master Tool\n\n' +
      'Usage:\n' +
      '  node fano-tool.js <command> [capability]\n\n' +
      'Commands:\n' +
      '  list                    List all capabilities\n' +
      '  run <capability>        Run specific capability tests\n' +
      '  audit                   Run full feature audit\n' +
      '  help                    Show this help\n'
    );
  }
}

new FanoMasterTool().run();
