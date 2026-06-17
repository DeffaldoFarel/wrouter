#!/usr/bin/env node
/**
 * Migration script to add indexes to request_logs table
 * Run this once to improve query performance on existing databases
 */

const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, '..', 'data', 'wrouter.db');
const db = new Database(dbPath);

console.log('🚀 Adding performance indexes to request_logs table...\n');

const indexes = [
  { name: 'timestamp_idx', sql: 'CREATE INDEX IF NOT EXISTS timestamp_idx ON request_logs (timestamp)' },
  { name: 'provider_id_idx', sql: 'CREATE INDEX IF NOT EXISTS provider_id_idx ON request_logs (provider_id)' },
  { name: 'api_key_id_idx', sql: 'CREATE INDEX IF NOT EXISTS api_key_id_idx ON request_logs (api_key_id)' },
  { name: 'model_idx', sql: 'CREATE INDEX IF NOT EXISTS model_idx ON request_logs (model)' },
  { name: 'status_idx', sql: 'CREATE INDEX IF NOT EXISTS status_idx ON request_logs (status)' },
  { name: 'timestamp_status_idx', sql: 'CREATE INDEX IF NOT EXISTS timestamp_status_idx ON request_logs (timestamp, status)' },
];

let successCount = 0;
let skipCount = 0;

for (const index of indexes) {
  try {
    const result = db.exec(index.sql);
    console.log(`✅ Created index: ${index.name}`);
    successCount++;
  } catch (error) {
    if (error.message.includes('already exists')) {
      console.log(`⏭️  Skipped (already exists): ${index.name}`);
      skipCount++;
    } else {
      console.error(`❌ Failed to create ${index.name}:`, error.message);
    }
  }
}

console.log(`\n📊 Summary:`);
console.log(`   Created: ${successCount}`);
console.log(`   Skipped: ${skipCount}`);
console.log(`   Total: ${indexes.length}`);

db.close();
console.log('\n✅ Migration complete!');
