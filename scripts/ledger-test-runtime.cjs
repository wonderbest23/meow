// Node test runtime for Next's server-only marker; production builds retain Next's boundary.
const Module = require('node:module');
const original = Module._load;
Module._load = function (name, parent, isMain) {
  if (name === 'server-only') return {};
  const value = original.call(this, name, parent, isMain);
  if (name === 'next/server' && globalThis.__ledgerAfter) {
    return { ...value, after: callback => globalThis.__ledgerAfter.push(callback) };
  }
  return value;
};
