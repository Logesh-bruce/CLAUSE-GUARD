/**
 * Sanitizer Pass — Detects adversarial manipulation techniques in raw contract text.
 * 
 * Threat Model:
 * 1. Invisible instructions (zero-width unicode, etc.)
 * 2. System prompt overriding ("ignore previous instructions")
 * 3. Masking high-risk clauses as boilerplate.
 * 
 * Note: PDF styling (white-on-white text) cannot be parsed by current pdf-parse,
 * so we rely on text-based heuristics.
 */

const ZERO_WIDTH_RE = /[\u200B-\u200D\uFEFF]/g;
const INJECTION_PHRASES = [
  /ignore\s+previous\s+instructions/i,
  /disregard\s+(?:the\s+)?above/i,
  /you\s+are\s+now/i,
  /system\s+override/i,
  /mark\s+this\s+as\s+low\s+risk/i,
  /this\s+clause\s+is\s+safe/i,
  /do\s+not\s+flag\s+this/i
];

function sanitize(text) {
  const flags = [];

  // 1. Zero-width character check
  if (ZERO_WIDTH_RE.test(text)) {
    flags.push('Contains hidden zero-width unicode characters (possible invisible instructions).');
  }

  // 2. Phrasing check
  for (const phrase of INJECTION_PHRASES) {
    if (phrase.test(text)) {
      flags.push('Contains phrasing associated with prompt injection or overriding AI instructions.');
      break; // Only flag once for phrasing
    }
  }

  return {
    isSuspicious: flags.length > 0,
    sanitizationFlags: flags,
  };
}

module.exports = { sanitize };
