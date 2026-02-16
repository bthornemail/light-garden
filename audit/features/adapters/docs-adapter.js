const fs = require('fs');
const path = require('path');

class DocsAdapter {
  countMarkdown() {
    const root = path.resolve(__dirname, '../../../docs');
    let count = 0;
    const stack = [root];
    while (stack.length) {
      const dir = stack.pop();
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, e.name);
        if (e.isDirectory()) stack.push(p);
        else if (e.isFile() && p.endsWith('.md')) count++;
      }
    }
    return count;
  }
}

module.exports = DocsAdapter;
