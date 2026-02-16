---
layout: default
title: Create a Document Adapter
---

# 🧪 Create a Document Adapter

Adapters transform new text sources into Light Garden geometry.

## Steps
1. **Choose your source** (Wikipedia, arXiv, local notes).
2. **Tokenize it** and map tokens to WordNet synsets. The `wordnet` folder contains offline data.
3. **Reduce** each synset to the closest Fano point or line via the semantic weights.
4. **Emit NDJSON** with `line`, `angle`, and optional `matrix` values.
5. **Drop the file** into `docs/assets/demos` and load it through the web viewer.

Example adapters already exist in the `canon-*.ndjson` collection.

[Back to guides overview →](/guides/)
