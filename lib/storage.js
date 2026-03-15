const fs = require('fs');
const path = require('path');

const dataRoot = process.env.DATA_DIR
  ? path.resolve(process.env.DATA_DIR)
  : __dirname ? path.join(__dirname, '..') : process.cwd();

const uploadsDir = process.env.UPLOADS_DIR
  ? path.resolve(process.env.UPLOADS_DIR)
  : path.join(dataRoot, 'uploads');

const dbPath = process.env.DB_PATH
  ? path.resolve(process.env.DB_PATH)
  : path.join(dataRoot, 'chat.db');

fs.mkdirSync(path.dirname(dbPath), { recursive: true });
fs.mkdirSync(uploadsDir, { recursive: true });

module.exports = {
  dataRoot,
  uploadsDir,
  dbPath,
};
