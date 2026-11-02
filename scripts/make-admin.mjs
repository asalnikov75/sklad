#!/usr/bin/env node
// Grant or revoke Super Admin for an existing account, directly in the data file.
//   node scripts/make-admin.mjs you@example.com          (grant)
//   node scripts/make-admin.mjs you@example.com --revoke
// Uses DATA_DIR like the app does (default ./data). Stop or restart the app is not required.
import fs from 'fs';
import path from 'path';

const [email, flag] = process.argv.slice(2);
if (!email) { console.error('Usage: node scripts/make-admin.mjs <email> [--revoke]'); process.exit(1); }
const file = path.join(path.resolve(process.env.DATA_DIR || 'data'), 'db.json');
if (!fs.existsSync(file)) { console.error(`No database at ${file}`); process.exit(1); }
const db = JSON.parse(fs.readFileSync(file, 'utf8'));
const u = (db.users || []).find((x) => x.email === email.trim().toLowerCase());
if (!u) { console.error(`No account with email ${email}. Register it first.`); process.exit(1); }
u.is_admin = flag !== '--revoke';
fs.writeFileSync(file + '.tmp', JSON.stringify(db, null, 2));
fs.renameSync(file + '.tmp', file);
console.log(`${u.email}: is_admin = ${u.is_admin}`);
