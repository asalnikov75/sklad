import fs from 'fs';
import path from 'path';
import { UPLOAD_DIR } from '@/lib/db';

export const dynamic = 'force-dynamic';
const TYPES = { '.jpg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.gif': 'image/gif' };

export function GET(_req, { params }) {
  const name = path.basename(params.name); // blocks path traversal
  const type = TYPES[path.extname(name).toLowerCase()];
  const file = path.join(UPLOAD_DIR, name);
  if (!type || !fs.existsSync(file)) return new Response('Не е намерено.', { status: 404 });
  return new Response(fs.readFileSync(file), {
    headers: { 'content-type': type, 'cache-control': 'public, max-age=31536000, immutable' },
  });
}
