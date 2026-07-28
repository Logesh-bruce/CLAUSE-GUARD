/**
 * Ingestion Service
 * Handles parsing of PDF, DOCX, and TXT contracts into clauses.
 *
 * Clause splitting strategy:
 * - Split on numbered/lettered list items (e.g., "1.", "1.1", "(a)", "Section 3")
 * - Split on paragraph breaks (double newlines)
 * - Clean up whitespace and remove clauses that are too short to be meaningful
 * - Minimum clause length: 30 characters (skips headers, blank lines, page numbers)
 */

const { IngestionError, UnsupportedFileTypeError, EmptyDocumentError } = require('../utils/errors');

const SUPPORTED_TYPES = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/plain',
  'application/octet-stream', // fallback for some upload clients
];

const MIN_CLAUSE_LENGTH = 30;
const MAX_CLAUSES = 60;

/**
 * Parse a file buffer into plain text.
 * @param {Buffer} buffer
 * @param {string} mimetype
 * @param {string} originalname
 * @returns {Promise<string>}
 */
async function parseFile(buffer, mimetype, originalname = '') {
  const ext = originalname.split('.').pop().toLowerCase();

  try {
    if (mimetype === 'application/pdf' || ext === 'pdf') {
      const pdfParse = require('pdf-parse');
      const data = await pdfParse(buffer);
      return data.text;
    }

    if (
      mimetype === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
      ext === 'docx'
    ) {
      const mammoth = require('mammoth');
      const result = await mammoth.extractRawText({ buffer });
      return result.value;
    }

    if (mimetype === 'text/plain' || ext === 'txt' || mimetype === 'application/octet-stream') {
      return buffer.toString('utf8');
    }

    throw new UnsupportedFileTypeError(mimetype || ext);
  } catch (err) {
    if (err.name === 'UnsupportedFileTypeError') throw err;
    throw new IngestionError(`Failed to parse file: ${err.message}`, null);
  }
}

/**
 * Parse plain text (pasted content) — no file parsing needed.
 * @param {string} text
 * @returns {string}
 */
function parseText(text) {
  return text;
}

/**
 * Split a contract text into individual clauses.
 * Applies multi-pass heuristics to handle messy real-world documents.
 * @param {string} rawText
 * @returns {Array<{id: number, text: string, rawIndex: number}>}
 */
function splitClauses(rawText) {
  if (!rawText || rawText.trim().length === 0) {
    throw new EmptyDocumentError();
  }

  // Normalize line endings
  let text = rawText.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

  // Remove PDF artifact characters and excessive whitespace
  text = text.replace(/[^\x20-\x7E\n]/g, ' ');
  text = text.replace(/[ \t]+/g, ' ');

  // Split strategies in priority order:
  // 1. Numbered clauses: "1.", "1.1.", "Section 1", "Article 1", "(1)", "(a)"
  // 2. Lettered subsections
  // 3. Double newlines (paragraph breaks)

  const clauseSplitRegex = /(?:^|\n)(?=\s*(?:(?:Section|Article|Clause|Paragraph)\s+\d+[\.\:]?|(?:\d+\.)+\s+|(?:[a-z]\.|[ivxlcdm]+\.)\s+|\(\d+\)\s+|\([a-z]\)\s+))/gim;

  let rawSegments = text.split(clauseSplitRegex);

  // If the regex split produced fewer than 3 segments, fall back to paragraph splitting
  if (rawSegments.length < 3) {
    rawSegments = text.split(/\n{2,}/);
  }

  // If still fewer than 3, the document may be all one paragraph — split by sentence boundary
  if (rawSegments.length < 3) {
    rawSegments = text.split(/(?<=\w{5,}\.)\s+(?=[A-Z])/);
  }

  const clauses = [];
  let rawIndex = 0;

  for (const segment of rawSegments) {
    const cleaned = segment.replace(/\n/g, ' ').replace(/\s+/g, ' ').trim();

    if (cleaned.length >= MIN_CLAUSE_LENGTH) {
      clauses.push({
        id: clauses.length + 1,
        text: cleaned,
        rawIndex,
      });
    }
    rawIndex += segment.length;

    if (clauses.length >= MAX_CLAUSES) break;
  }

  if (clauses.length === 0) {
    throw new EmptyDocumentError();
  }

  return clauses;
}

module.exports = { parseFile, parseText, splitClauses };
