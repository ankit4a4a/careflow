const path = require('path');

/** Resolve an application-generated storage key without allowing path traversal. */
function safeStoragePath(root, storageKey) {
  if (typeof storageKey !== 'string' || !storageKey || storageKey === '.' || storageKey === '..') return null;
  if (/[\\/\0]/.test(storageKey) || path.basename(storageKey) !== storageKey) return null;
  const base = path.resolve(root);
  const target = path.resolve(base, storageKey);
  if (!target.startsWith(`${base}${path.sep}`)) return null;
  return target;
}

module.exports = { safeStoragePath };
