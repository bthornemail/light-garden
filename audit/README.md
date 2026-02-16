# Light Garden Audit Framework

NDJSON-based audit/introspection framework.

## Run

```bash
cd audit
npm run validate
```

## Commands

- `npm run generate:golden`
- `npm run generate:negative`
- `npm run validate`
- `npm run validate:node -- --node wordnet-service --trace ./traces/golden/wordnet-lookup.ndjson`

## Output

- `traces/golden/*.ndjson`
- `traces/negative/*.ndjson`
- `artifacts/reports/audit-summary.json`
- `results/latest/passed.json`
- `results/latest/failed.json`
- `results/latest/metrics.json`
