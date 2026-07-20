/**
 * Dropbox upload via refresh-token auth (long-lived, no manual re-auth needed).
 * Same pattern as your enex_to_dropbox.py pipeline, ported to JS.
 */

async function getAccessToken() {
  // TEMPORARY DIAGNOSTIC LOGGING - remove once the invalid_client issue is resolved
  const crypto = require('crypto');
  const key = process.env.DROPBOX_APP_KEY || '';
  const secret = process.env.DROPBOX_APP_SECRET || '';
  const token = process.env.DROPBOX_REFRESH_TOKEN || '';
  const hash = (v) => crypto.createHash('sha256').update(v).digest('hex').slice(0, 12);
  console.log('DEBUG - APP_KEY hash:', hash(key), 'len:', key.length);
  console.log('DEBUG - APP_SECRET hash:', hash(secret), 'len:', secret.length);
  console.log('DEBUG - REFRESH_TOKEN hash:', hash(token), 'len:', token.length);

  const response = await fetch('https://api.dropbox.com/oauth2/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: process.env.DROPBOX_REFRESH_TOKEN,
      client_id: process.env.DROPBOX_APP_KEY,
      client_secret: process.env.DROPBOX_APP_SECRET,
    }),
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(`Dropbox token refresh failed: ${JSON.stringify(data)}`);
  }
  return data.access_token;
}

async function uploadToDropbox(fileBuffer, dropboxPath) {
  const accessToken = await getAccessToken();

  const response = await fetch('https://content.dropboxapi.com/2/files/upload', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/octet-stream',
      'Dropbox-API-Arg': JSON.stringify({
        path: dropboxPath,
        mode: 'add',       // won't overwrite; use 'overwrite' if you want that instead
        autorename: true,  // if a file with the same name exists, Dropbox appends (1), (2) etc
        mute: false,
      }),
    },
    body: fileBuffer,
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(`Dropbox upload failed: ${JSON.stringify(data)}`);
  }
  return data;
}

module.exports = { uploadToDropbox };
