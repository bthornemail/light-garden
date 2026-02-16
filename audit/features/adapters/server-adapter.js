const { requestText, requestJson } = require('../../scripts/lib');

class ServerAdapter {
  get(path) {
    return requestText(`http://localhost:8080${path}`);
  }
  getWordnet(path) {
    return requestJson(`http://localhost:4096${path}`);
  }
}

module.exports = ServerAdapter;
