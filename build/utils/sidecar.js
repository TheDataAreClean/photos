'use strict';

// Override helper: empty string in sidecar falls back to source value
function ov(override, fallback) {
  return (override !== null && override !== undefined && override !== '')
    ? override : fallback;
}

// YAML value serialisers for sidecar stubs
function ymlStr(v) { return v != null ? ` "${v}"` : ''; }
function ymlNum(v) { return v != null ? ` ${v}`   : ''; }

module.exports = { ov, ymlStr, ymlNum };
