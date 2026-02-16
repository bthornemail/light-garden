const fs = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');

function ensureDir(p) {
  fs.mkdirSync(p, { recursive: true });
}

function writeNdjson(filePath, records) {
  ensureDir(path.dirname(filePath));
  const body = records.map((r) => JSON.stringify(r)).join('\n') + '\n';
  fs.writeFileSync(filePath, body, 'utf8');
}

function readNdjson(filePath) {
  return fs
    .readFileSync(filePath, 'utf8')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l, i) => {
      try {
        return JSON.parse(l);
      } catch (err) {
        throw new Error(`Invalid NDJSON at ${filePath}:${i + 1} (${err.message})`);
      }
    });
}

function writeJson(filePath, obj) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, JSON.stringify(obj, null, 2) + '\n', 'utf8');
}

function now() {
  return Date.now();
}

function requestJson(url, timeoutMs = 8000) {
  const client = url.startsWith('https') ? https : http;
  return new Promise((resolve) => {
    const req = client.get(url, { timeout: timeoutMs }, (res) => {
      let data = '';
      res.on('data', (c) => (data += c));
      res.on('end', () => {
        let json = null;
        try {
          json = data ? JSON.parse(data) : null;
        } catch (_) {
          // keep null
        }
        resolve({ ok: res.statusCode >= 200 && res.statusCode < 300, status: res.statusCode, data: json, raw: data });
      });
    });
    req.on('timeout', () => {
      req.destroy(new Error('timeout'));
    });
    req.on('error', (err) => resolve({ ok: false, status: 0, error: err.message, data: null, raw: '' }));
  });
}

function requestText(url, timeoutMs = 8000) {
  const client = url.startsWith('https') ? https : http;
  return new Promise((resolve) => {
    const req = client.get(url, { timeout: timeoutMs }, (res) => {
      let data = '';
      res.on('data', (c) => (data += c));
      res.on('end', () => {
        resolve({ ok: res.statusCode >= 200 && res.statusCode < 300, status: res.statusCode, data });
      });
    });
    req.on('timeout', () => {
      req.destroy(new Error('timeout'));
    });
    req.on('error', (err) => resolve({ ok: false, status: 0, error: err.message, data: '' }));
  });
}

module.exports = {
  ensureDir,
  writeNdjson,
  readNdjson,
  writeJson,
  now,
  requestJson,
  requestText
};
