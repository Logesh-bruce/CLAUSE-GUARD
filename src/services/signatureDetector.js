/**
 * Signature Detector — fast, rule-based heuristic (zero LLM calls)
 *
 * Strategy:
 * 1. Look for signature-block markers in the tail of the document (last 40%)
 *    AND across the full text as a fallback.
 * 2. If a signature block is found, check whether the fields appear filled
 *    (non-blank content follows the label).
 * 3. Return a structured result with a clear, user-readable message.
 *
 * Runs in < 5ms on any contract size.
 */

// Patterns that indicate a signature block marker is present
const SIG_BLOCK_PATTERNS = [
  /\bsignature\b\s*[:_\-]{0,3}/i,
  /\bsign\s+here\b/i,
  /\bauthorized\s+signature\b/i,
  /\bprint(?:ed)?\s+name\b\s*[:_\-]{0,3}/i,
  /\bwitnessed?\s+by\b/i,
  /\bwitness\s+signature\b/i,
  /\binitials?\b\s*[:_\-]{0,3}/i,
  /\bby\s*[:]\s*[_\s]{3,}/i,       // "By: _____________"
  /\bx\s*[_]{3,}/i,                 // "X ___________"
  /_{6,}/,                           // 6+ underscores in a row (blank line)
  /\[signature\]/i,
  /\[sign\s+here\]/i,
  /\bsigned\s+by\b/i,
  /\bexecuted\s+(?:by|on|as)\b/i,
  /\baccepted\s+by\b\s*[:_\-]{0,3}/i,
  /\bdate\s+of\s+(?:signing|execution)\b/i,
];

// Patterns that suggest a signature field has been filled in
// (some non-trivial content follows the label)
const FILLED_PATTERNS = [
  /\bsignature\b\s*[:\-]?\s*(?!_)(?!\bsignature\b)[A-Za-z]{3,}/i, // "Signature: John"
  /\bsigned\s+by\b\s*[:\-]?\s*[A-Za-z]{3,}/i,
  /\bprint(?:ed)?\s+name\b\s*[:\-]?\s*[A-Z][a-z]+\s+[A-Z]/,       // "Print Name: John Smith"
  /\binitials?\b\s*[:\-]?\s*[A-Z]{1,5}\b/,                          // "Initials: JDS"
  /\bby\s*[:\-]\s*[A-Za-z]{4,}/i,                                    // "By: Acme Corp"
  /\baccepted\s+by\b\s*[:\-]?\s*[A-Za-z]{4,}/i,
  /\bexecuted\s+by\b\s*[:\-]?\s*[A-Za-z]{4,}/i,
  /\bduly\s+(?:authorized|executed|signed)\b/i,
];

/**
 * Detect whether a contract has a signature block and whether it appears signed.
 * @param {string} rawText - the full extracted document text
 * @returns {{ hasSigBlock: boolean, signed: boolean, message: string }}
 */
function detectSignature(rawText) {
  if (!rawText || rawText.trim().length === 0) {
    return {
      hasSigBlock: false,
      signed: false,
      message: 'Document is empty — no signature block detected.',
    };
  }

  // Focus on the tail (last 40% of doc) where sig blocks typically live,
  // but also scan the full text in case it's embedded mid-document.
  const splitPoint = Math.floor(rawText.length * 0.6);
  const tail = rawText.slice(splitPoint);
  const fullText = rawText;

  const hasSigInTail = SIG_BLOCK_PATTERNS.some(p => p.test(tail));
  const hasSigInFull = !hasSigInTail && SIG_BLOCK_PATTERNS.some(p => p.test(fullText));
  const hasSigBlock = hasSigInTail || hasSigInFull;

  if (!hasSigBlock) {
    return {
      hasSigBlock: false,
      signed: false,
      message: 'No signature block detected in this document.',
    };
  }

  // Check if any filled-signature pattern matches in tail or full text
  const signedInTail = FILLED_PATTERNS.some(p => p.test(tail));
  const signedInFull = !signedInTail && FILLED_PATTERNS.some(p => p.test(fullText));
  const signed = signedInTail || signedInFull;

  return {
    hasSigBlock: true,
    signed,
    message: signed
      ? 'Signature block present and appears to be signed.'
      : 'Signature block present but appears unsigned — fields may be blank.',
  };
}

module.exports = { detectSignature };
