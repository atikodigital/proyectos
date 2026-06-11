const crypto = require('crypto');

function imageHash(buffer) {
  if (!buffer || !buffer.length) return '';
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

module.exports = { imageHash };
