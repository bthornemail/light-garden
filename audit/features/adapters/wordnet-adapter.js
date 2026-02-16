const { requestJson } = require('../../scripts/lib');

class WordnetAdapter {
  async lookup(word) {
    return requestJson(`http://localhost:4096/api/wordnet/lookup?word=${encodeURIComponent(word)}`);
  }
}

module.exports = WordnetAdapter;
