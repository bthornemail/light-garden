---
layout: default
title: Search Light Garden Documentation
---

# 🔍 Search Documentation

<div id="search-box">
  <input type="text" id="search-input" placeholder="Search for terms, articles, guides..." style="width: 100%; padding: 12px; font-size: 18px;">
</div>

<div id="search-results" style="margin-top: 30px;"></div>

<script>
const searchIndex = [
  { title: "Fano Plane", url: "/protocol/fano-plane", content: "7 points, 7 lines, geometry, ratios, mapping" },
  { title: "Epistemic Square", url: "/protocol/fano-plane#epistemic-square", content: "quadrants, KK, KU, UK, UU, four questions" },
  { title: "Quick Start", url: "/quick-start", content: "setup, installation, run, 5 minutes" },
  { title: "Build a Dome", url: "/guides/build-dome", content: "PVC, poles, bands, LEDs, ESP32, hardware" },
  { title: "ESP32 Firmware", url: "/guides/esp32-firmware", content: "minimal_probe.h, LoRa, sensors, LEDs" },
  { title: "Wisdom Fractal", url: "/demos/wisdom-fractal", content: "video, GIF, 77 frames, 7.7 seconds" },
  { title: "Interplanetary Demo", url: "/demos/interplanetary", content: "Earth, Mars, satellites, laser, 100Gbps" },
  { title: "Covenant", url: "/philosophy/covenant", content: "ethics, AGI, 16 lines, machine, human" },
  { title: "Articles", url: "/philosophy/articles", content: "Solomon, Solon, Asabiyyah, Metatron, eight articles" },
  { title: "Gospel of Number", url: "/philosophy/gospel-of-number", content: "confession, number, idol, Logos" },
  { title: "Canticle", url: "/philosophy/canticle", content: "reconciliation, Logos, Number, peace" },
  { title: "Glossary", url: "/glossary", content: "terms, definitions, A to Z" },
  { title: "HD Paths", url: "/protocol/hd-paths", content: "wallet, m/240', addressing, derivation" },
  { title: "NDJSON Spec", url: "/protocol/ndjson-spec", content: "format, events, matrix, angle, trace" },
  { title: "Federation", url: "/protocol/federation", content: "share line, keep differential, sync" },
  { title: "WordNet Integration", url: "/protocol/wordnet-integration", content: "synsets, lookup, semantic mapping" },
  { title: "Create Adapter", url: "/guides/create-adapter", content: "document, API, Wikipedia, arXiv" },
  { title: "Contribute", url: "/guides/contribute", content: "how to help, code, docs, hardware" }
];

document.getElementById('search-input').addEventListener('input', function(e) {
  const query = e.target.value.toLowerCase();
  const results = document.getElementById('search-results');
  
  if (query.length < 2) {
    results.innerHTML = '<p>Type at least 2 characters to search...</p>';
    return;
  }
  
  const matches = searchIndex.filter(item => 
    item.title.toLowerCase().includes(query) || 
    item.content.toLowerCase().includes(query)
  );
  
  if (matches.length === 0) {
    results.innerHTML = '<p>No results found.</p>';
    return;
  }
  
  let html = '<ul style="list-style: none; padding: 0;">';
  matches.forEach(match => {
    html += `<li style="margin-bottom: 15px;">
      <a href="${match.url}" style="font-size: 18px; font-weight: bold;">${match.title}</a>
      <div style="color: #666;">${match.content}</div>
    </li>`;
  });
  html += '</ul>';
  
  results.innerHTML = html;
});
</script>
