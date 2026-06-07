'use strict';

const fs = require('fs');
const path = require('path');

class OffchainStore {
  constructor(rootDir) {
    this.rootDir = rootDir;
    fs.mkdirSync(rootDir, { recursive: true });
  }

  putJson(bucket, name, value) {
    const safeBucket = bucket.replace(/[^a-zA-Z0-9_-]/g, '_');
    const safeName = name.replace(/[^a-zA-Z0-9_.-]/g, '_');
    const dir = path.join(this.rootDir, safeBucket);
    const filePath = path.join(dir, safeName);

    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(filePath, JSON.stringify(value, null, 2), 'utf8');

    return {
      uri: `offchain://${safeBucket}/${safeName}`,
      path: filePath
    };
  }
}

module.exports = {
  OffchainStore
};

