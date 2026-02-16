#!/usr/bin/env node
/**
 * Adapter Tools Generator
 * Creates CLI tools for each feature adapter
 */

const fs = require('fs');
const path = require('path');
const features = require('../features');

class AdapterToolsGenerator {
  constructor() {
    this.toolsDir = path.join(__dirname, '../features/tools');
  }

  async generate() {
    console.log('Generating adapter tools...');

    if (!fs.existsSync(this.toolsDir)) {
      fs.mkdirSync(this.toolsDir, { recursive: true });
    }

    for (const cap of features.capabilities) {
      await this.generateTool(cap);
    }

    await this.generateMasterTool();

    console.log('Adapter tools generated.');
  }

  className(capId) {
    return capId
      .split('-')
      .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
      .join('');
  }

  async generateTool(capability) {
    const toolPath = path.join(this.toolsDir, `${capability.id}-tool.js`);
    const className = `${this.className(capability.id)}Tool`;

    const toolTemplate = `#!/usr/bin/env node
/**
 * ${capability.name} CLI Tool
 * Test and validate ${capability.id} features
 */

const fs = require('fs');
const path = require('path');
const Adapter = require('../adapters/${capability.id}-adapter');

function readNdjson(filePath) {
  return fs.readFileSync(filePath, 'utf8')
    .split('\\n')
    .map(l => l.trim())
    .filter(Boolean)
    .map(l => JSON.parse(l));
}

class ${className} {
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
    console.log('Running ${capability.name} tests...\\n');

    const golden = await this.adapter.runGoldenTests();
    const negative = await this.adapter.runNegativeTests();

    console.log('Golden Tests:');
    golden.forEach(t => console.log('  ' + (t.status === 'passed' ? 'OK' : 'PENDING') + ' ' + t.name));

    console.log('\\nNegative Tests:');
    negative.forEach(t => console.log('  ' + (t.status === 'passed' ? 'OK' : 'PENDING') + ' ' + t.name));
  }

  async showGolden() {
    const traces = readNdjson(path.join(this.base, 'golden/${capability.id}.golden.ndjson'));
    console.log(JSON.stringify(traces, null, 2));
  }

  async showNegative() {
    const traces = readNdjson(path.join(this.base, 'negative/${capability.id}.negative.ndjson'));
    console.log(JSON.stringify(traces, null, 2));
  }

  async showCoverage() {
    const coverage = await this.adapter.getCoverage();
    console.log(JSON.stringify(coverage, null, 2));
  }

  showHelp() {
    console.log(
      '${capability.name} CLI Tool\\n\\n' +
      'Usage:\\n' +
      '  node ${capability.id}-tool.js <command>\\n\\n' +
      'Commands:\\n' +
      '  test      Run all tests\\n' +
      '  golden    Show golden traces\\n' +
      '  negative  Show negative traces\\n' +
      '  coverage  Show test coverage\\n' +
      '  help      Show this help\\n'
    );
  }
}

const tool = new ${className}();
tool.run().catch(console.error);
`;

    fs.writeFileSync(toolPath, toolTemplate, 'utf8');
    fs.chmodSync(toolPath, 0o755);

    console.log(`  ${capability.id}-tool.js`);
  }

  async generateMasterTool() {
    const masterPath = path.join(this.toolsDir, 'fano-tool.js');

    const masterTemplate = `#!/usr/bin/env node
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
    console.log('\\nAvailable Capabilities:\\n');
    features.capabilities.forEach((cap) => {
      console.log('  ' + cap.id.padEnd(20) + cap.name);
      console.log('  ' + ' '.repeat(20) + 'Severity: ' + cap.severity + ', Tests: ' + (cap.tests.golden + cap.tests.negative) + '\\n');
    });
  }

  runCapability() {
    const cap = features.capabilities.find((c) => c.id === this.subcommand);
    if (!cap) {
      console.error('Unknown capability: ' + this.subcommand);
      process.exit(1);
    }

    console.log('\\nRunning ' + cap.name + ' tests...\\n');
    execSync('node ' + path.join(__dirname, cap.id + '-tool.js') + ' test', { stdio: 'inherit' });
  }

  runFullAudit() {
    console.log('Running full feature tool audit...\\n');
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
      '\\nFano Master Tool\\n\\n' +
      'Usage:\\n' +
      '  node fano-tool.js <command> [capability]\\n\\n' +
      'Commands:\\n' +
      '  list                    List all capabilities\\n' +
      '  run <capability>        Run specific capability tests\\n' +
      '  audit                   Run full feature audit\\n' +
      '  help                    Show this help\\n'
    );
  }
}

new FanoMasterTool().run();
`;

    fs.writeFileSync(masterPath, masterTemplate, 'utf8');
    fs.chmodSync(masterPath, 0o755);

    console.log('  fano-tool.js');
  }
}

const generator = new AdapterToolsGenerator();
generator.generate().catch((err) => {
  console.error(err.stack || String(err));
  process.exit(1);
});
