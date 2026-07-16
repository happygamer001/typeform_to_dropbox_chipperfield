const crypto = require('crypto');

/**
 * Verifies the 'Typeform-Signature' header against the raw request body.
 * Typeform signs the payload with your webhook secret using HMAC-SHA256,
 * base64-encoded, prefixed with "sha256=".
 *
 * Docs: https://www.typeform.com/developers/webhooks/secure-your-webhooks/
 */
function verifySignature(receivedSignature, rawBody, secret) {
  if (!receivedSignature) return false;

  const hash = crypto.createHmac('sha256', secret).update(rawBody).digest('base64');
  const expectedSignature = `sha256=${hash}`;

  const received = Buffer.from(receivedSignature);
  const expected = Buffer.from(expectedSignature);

  // Lengths must match before timingSafeEqual, or it throws
  if (received.length !== expected.length) return false;

  return crypto.timingSafeEqual(received, expected);
}

module.exports = { verifySignature };
