const fs = require('fs');
const path = require('path');

const UPLOADS_DIR = process.env.UPLOADS_DIR || path.join(__dirname, '..', '..', 'uploads');

function extFor(mime) { return (mime && String(mime).includes('png')) ? 'png' : 'jpg'; }

function storeImage(buffer, mimeType, id) {
  if (!buffer || !buffer.length || !id) return null;
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
  const name = String(id) + '.' + extFor(mimeType);
  fs.writeFileSync(path.join(UPLOADS_DIR, name), buffer);
  return name;
}

function readImage(fotoPath) {
  if (!fotoPath) return null;
  const p = path.join(UPLOADS_DIR, path.basename(String(fotoPath))); // basename evita path traversal
  if (!fs.existsSync(p)) return null;
  return fs.readFileSync(p);
}

function deleteImage(fotoPath) {
  if (!fotoPath) return;
  try { fs.unlinkSync(path.join(UPLOADS_DIR, path.basename(String(fotoPath)))); } catch (e) { /* ya no existe */ }
}

function contentTypeFor(fotoPath) { return String(fotoPath || '').endsWith('png') ? 'image/png' : 'image/jpeg'; }

module.exports = { storeImage, readImage, deleteImage, contentTypeFor, extFor, UPLOADS_DIR };
