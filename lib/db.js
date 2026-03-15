const Database = require('better-sqlite3');
const { dbPath } = require('./storage');

const db = new Database(dbPath);

db.pragma('journal_mode = WAL');

function recreateMessagesTable() {
  const hasFileUrl = db.prepare('PRAGMA table_info(messages)').all().some((column) => column.name === 'file_url');

  db.transaction(() => {
    db.exec(`
      CREATE TABLE messages_new (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        conversation_id INTEGER NOT NULL,
        sender_id INTEGER,
        message TEXT NOT NULL,
        message_type TEXT NOT NULL DEFAULT 'text' CHECK(message_type IN ('text','ai','file')),
        file_url TEXT,
        latitude REAL,
        longitude REAL,
        location_label TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE,
        FOREIGN KEY (sender_id) REFERENCES users(id) ON DELETE SET NULL
      )
    `);

    db.exec(`
      INSERT INTO messages_new (
        id, conversation_id, sender_id, message, message_type, file_url,
        latitude, longitude, location_label, created_at
      )
      SELECT
        id,
        conversation_id,
        sender_id,
        message,
        message_type,
        ${hasFileUrl ? 'file_url' : 'NULL'},
        latitude,
        longitude,
        location_label,
        created_at
      FROM messages
    `);

    db.exec('DROP TABLE messages');
    db.exec('ALTER TABLE messages_new RENAME TO messages');
  })();
}

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  avatar_url TEXT,
  status_text TEXT DEFAULT 'Disponible',
  is_verified INTEGER DEFAULT 0,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS email_codes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  code TEXT NOT NULL,
  type TEXT NOT NULL CHECK(type IN ('verify','reset')),
  expires_at TEXT NOT NULL,
  used INTEGER DEFAULT 0,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS conversations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  kind TEXT NOT NULL DEFAULT 'direct' CHECK(kind IN ('direct','ai')),
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS conversation_members (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  conversation_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  UNIQUE(conversation_id, user_id),
  FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  conversation_id INTEGER NOT NULL,
  sender_id INTEGER,
  message TEXT NOT NULL,
  message_type TEXT NOT NULL DEFAULT 'text' CHECK(message_type IN ('text','ai','file')),
  file_url TEXT,
  latitude REAL,
  longitude REAL,
  location_label TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE,
  FOREIGN KEY (sender_id) REFERENCES users(id) ON DELETE SET NULL
);
`);

const messageColumns = db.prepare('PRAGMA table_info(messages)').all();
const columnNames = new Set(messageColumns.map((column) => column.name));
const messageTableSql = db.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'messages'").get()?.sql || '';

if (!columnNames.has('file_url') || !messageTableSql.includes("'file'")) {
  recreateMessagesTable();
}

const migratedMessageColumns = db.prepare('PRAGMA table_info(messages)').all();
const migratedColumnNames = new Set(migratedMessageColumns.map((column) => column.name));

if (!migratedColumnNames.has('latitude')) {
  db.exec('ALTER TABLE messages ADD COLUMN latitude REAL');
}

if (!migratedColumnNames.has('longitude')) {
  db.exec('ALTER TABLE messages ADD COLUMN longitude REAL');
}

if (!migratedColumnNames.has('location_label')) {
  db.exec('ALTER TABLE messages ADD COLUMN location_label TEXT');
}

module.exports = db;
