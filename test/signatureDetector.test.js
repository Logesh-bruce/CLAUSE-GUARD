const test = require('node:test');
const assert = require('node:assert');
const { detectSignature } = require('../src/services/signatureDetector');

test('Signature Detector: Missing Signature', (t) => {
  const text = 'This is a standard contract with no signature block anywhere at the end. It just stops.';
  const result = detectSignature(text);
  assert.strictEqual(result.hasSigBlock, false);
  assert.strictEqual(result.signed, false);
});

test('Signature Detector: Unsigned Signature Block', (t) => {
  const text = 'This agreement is accepted by:\nSignature: ____________\nPrint Name: ____________\nDate: ________';
  const result = detectSignature(text);
  assert.strictEqual(result.hasSigBlock, true);
  assert.strictEqual(result.signed, false);
});

test('Signature Detector: Signed Signature Block', (t) => {
  const text = 'This agreement is accepted by:\nSignature: John Doe\nPrint Name: John Doe\nDate: 2026-07-28';
  const result = detectSignature(text);
  assert.strictEqual(result.hasSigBlock, true);
  assert.strictEqual(result.signed, true);
});

test('Signature Detector: Blank Lines Signature', (t) => {
  const text = 'Acknowledged and agreed.\n\n_______________________\nBy the Client';
  const result = detectSignature(text);
  assert.strictEqual(result.hasSigBlock, true);
  assert.strictEqual(result.signed, false);
});
