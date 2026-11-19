const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { safeStoragePath } = require('../src/utils/privateStorage');
const root = path.resolve('/srv/careflow/private-uploads');

test('private storage resolver accepts a single safe storage key', () => {
  assert.equal(safeStoragePath(root, '9f3a2c-report.pdf'), path.join(root, '9f3a2c-report.pdf'));
});

test('private storage resolver rejects traversal, separators, null bytes and empty keys', () => {
  for (const key of ['../secret', '..\\secret', '/etc/passwd', 'folder/file.pdf', 'folder\\file.pdf', '\0bad', '', '.', '..']) {
    assert.equal(safeStoragePath(root, key), null, `expected rejection for ${JSON.stringify(key)}`);
  }
});

test('patient and patient-portal downloads resolve stored files through the safe path helper', () => {
  const patientRoutes = fs.readFileSync(path.join(__dirname, '../src/routes/patients.js'), 'utf8');
  const portalRoutes = fs.readFileSync(path.join(__dirname, '../src/routes/patient-portal.js'), 'utf8');
  assert.match(patientRoutes, /safeStoragePath\(privateRoot,doc\.storageKey\)/);
  assert.match(patientRoutes, /safeStoragePath\(privateRoot,p\.profilePhoto\.storageKey\)/);
  assert.match(portalRoutes, /safeStoragePath\(path\.resolve\(__dirname,'\.\.\/\.\.\/private-uploads'\),doc\.storageKey\)/);
});

test('refresh token replay revokes remaining sessions and increments token version', () => {
  const authRoutes = fs.readFileSync(path.join(__dirname, '../src/routes/auth.js'), 'utf8');
  assert.match(authRoutes, /auth\.refresh_token_reuse_detected/);
  assert.match(authRoutes, /Session\.updateMany\(\{userId:reused\.userId,revokedAt:null\}/);
  assert.match(authRoutes, /User\.findByIdAndUpdate\(reused\.userId,\{\$inc:\{tokenVersion:1\}\}\)/);
});
