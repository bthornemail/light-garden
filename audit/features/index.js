/**
 * Light Garden Feature Registry
 * Maps capabilities to nodes, tests, and severity levels
 */

module.exports = {
  version: '1.0.0',

  capabilities: [
    {
      id: 'geometric-encoding',
      name: 'Geometric Encoding',
      description: 'Fano plane -> matrix -> seed -> mnemonic',
      nodes: ['fano-core', 'wordnet-service', 'c-server'],
      severity: 'critical',
      tests: {
        golden: 12,
        negative: 8,
        coverage: 0
      },
      dependencies: ['semantic-mapping']
    },
    {
      id: 'semantic-mapping',
      name: 'Semantic Mapping',
      description: 'WordNet synsets -> knowledge triples -> Fano points',
      nodes: ['wordnet-service', 'document-adapters'],
      severity: 'critical',
      tests: {
        golden: 15,
        negative: 10,
        coverage: 0
      },
      dependencies: []
    },
    {
      id: 'light-rendering',
      name: 'Light Rendering',
      description: 'Matrix -> 7/61/241 LED arrays -> 16x16 window',
      nodes: ['c-server', 'firmware', 'web-client'],
      severity: 'high',
      tests: {
        golden: 8,
        negative: 6,
        coverage: 0
      },
      dependencies: ['geometric-encoding']
    },
    {
      id: 'mesh-networking',
      name: 'Mesh Networking',
      description: 'LoRa packets -> Fano relay -> federation',
      nodes: ['firmware', 'c-server'],
      severity: 'high',
      tests: {
        golden: 6,
        negative: 8,
        coverage: 0
      },
      dependencies: ['geometric-encoding']
    },
    {
      id: 'document-adapters',
      name: 'Document Adapters',
      description: 'Wikipedia/arXiv/Archive -> Fano encoding',
      nodes: ['wordnet-service', 'document-adapters'],
      severity: 'medium',
      tests: {
        golden: 10,
        negative: 7,
        coverage: 0
      },
      dependencies: ['semantic-mapping']
    }
  ],

  severityLevels: {
    critical: { threshold: 1.0, autoIssue: true },
    high: { threshold: 0.95, autoIssue: false },
    medium: { threshold: 0.9, autoIssue: false },
    low: { threshold: 0.85, autoIssue: false }
  },

  getCapability(id) {
    return this.capabilities.find((c) => c.id === id);
  },

  getNodesForSeverity(severity) {
    return this.capabilities.filter((c) => c.severity === severity).flatMap((c) => c.nodes);
  }
};
