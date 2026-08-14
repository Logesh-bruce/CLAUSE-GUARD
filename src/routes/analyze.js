/**
 * POST /api/analyze
 *
 * Accepts:
 *   - multipart/form-data with a 'file' field (PDF, DOCX, TXT), OR
 *   - application/json with a 'text' field (plain contract text)
 *
 * Returns:
 *   {
 *     totalClauses:    number,
 *     flaggedCount:    number,
 *     allResults:      [...],        // All clauses with risk scores
 *     flaggedResults:  [...],        // Flagged clauses with LLM reasoning
 *     signatureCheck:  { hasSigBlock, signed, message },  // NEW
 *     keyDates:        [...],        // NEW: extracted renewal/deadline entries
 *     processingTime:  number        // milliseconds
 *   }
 */

const express = require('express');
const multer = require('multer');
const router = express.Router();

const { parseFile, parseText, splitClauses } = require('../services/ingestion');
const { detectRisks } = require('../services/riskDetector');
const { reasonAndDraft } = require('../services/llmReasoner');
const { detectSignature } = require('../services/signatureDetector');
const { extractKeyDates } = require('../services/dateExtractor');
const { sanitize } = require('../services/sanitizer');
const { checkConsistency } = require('../services/consistencyChecker');
const { IngestionError, UnsupportedFileTypeError, EmptyDocumentError } = require('../utils/errors');

const MAX_TEXT_LENGTH = 500000; // ~500k chars for pasted text

// Memory storage — no disk writes for uploaded files
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 }, // 20MB max
  fileFilter: (req, file, cb) => {
    const allowed = [
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'text/plain',
      'application/octet-stream',
    ];
    if (allowed.includes(file.mimetype) || file.originalname.match(/\.(pdf|docx|txt)$/i)) {
      cb(null, true);
    } else {
      cb(new UnsupportedFileTypeError(file.mimetype));
    }
  },
});

router.post('/', upload.single('file'), async (req, res, next) => {
  const startTime = Date.now();

  try {
    let rawText;

    if (req.file) {
      // File upload path
      rawText = await parseFile(req.file.buffer, req.file.mimetype, req.file.originalname);
    } else if (req.body.text && typeof req.body.text === 'string' && req.body.text.trim()) {
      // Plain text paste path
      if (req.body.text.length > MAX_TEXT_LENGTH) {
        return res.status(413).json({
          error: true,
          message: `Pasted text exceeds the ${Math.round(MAX_TEXT_LENGTH / 1000)}k character limit. Please upload a file (.pdf, .docx, .txt) instead.`,
        });
      }
      rawText = parseText(req.body.text);
    } else {
      return res.status(400).json({
        error: true,
        message: 'No content provided. Please upload a file (.pdf, .docx, .txt) or paste contract text.',
      });
    }

    const mode = req.query.mode === 'llm-only' ? 'llm-only' : 'hybrid';

    // Step 0: Sanitization (Prompt Injection Defense)
    const sanitization = sanitize(rawText);

    // Step 1: Signature check — fast regex, runs on raw text before clause splitting
    const signatureCheck = detectSignature(rawText);

    // Step 2: Split into clauses
    let clauses = splitClauses(rawText);

    // Cap total clauses to 60 to ensure fast analysis times
    if (clauses.length > 60) {
      clauses = clauses.slice(0, 60);
    }

    // Step 3: Key Date extraction (always runs)
    const keyDates = extractKeyDates(clauses);

    let allResults = [];
    let flaggedItems = [];

    if (mode === 'hybrid') {
      // Step 3a: Risk detection via TF-IDF
      allResults = detectRisks(clauses);
      flaggedItems = allResults.filter(r => r.isFlagged);
    } else {
      // LLM-Only Mode: Send all clauses to LLM directly without TF-IDF pre-filtering
      allResults = clauses.map(clause => ({
        clause,
        isFlagged: true,
        matchedPattern: null,
        score: 0,
        riskLevel: 'unknown'
      }));
      flaggedItems = allResults;
    }

    const isStream = req.headers.accept === 'application/x-ndjson';
    if (isStream) {
      res.setHeader('Content-Type', 'application/x-ndjson');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      
      // Send initial state immediately
      res.write(JSON.stringify({
        type: 'init',
        mode,
        totalClauses: clauses.length,
        flaggedCount: flaggedItems.length,
        sanitization,
        signatureCheck,
        keyDates,
        allResults // initial states without LLM logic yet
      }) + '\n');
    }

    // Step 4: LLM reasoning for flagged clauses (with concurrency limit)
    let enrichedFlagged = [];
    if (flaggedItems.length > 0) {
      enrichedFlagged = await reasonAndDraft(flaggedItems, mode, (item) => {
        if (isStream) {
          // Send individual clause updates as they finish
          res.write(JSON.stringify({ type: 'clause_done', item }) + '\n');
        }
      });
    }

    // Apply Consistency Check (Hybrid mode only)
    if (mode === 'hybrid') {
      enrichedFlagged = enrichedFlagged.map(item => {
        if (!item.llmSuccess) return item;
        const consistency = checkConsistency(item.score, item.matchedPattern?.riskLevel, item.llmRiskLevel);
        const finalItem = {
          ...item,
          suspiciousDisagreement: consistency.isSuspicious,
          disagreementReason: consistency.reason
        };
        // if consistency check overrides it, we should ideally stream a patch,
        // but since we do this after the fact, we just send a 'clause_patched' event
        if (isStream && consistency.isSuspicious) {
          res.write(JSON.stringify({ type: 'clause_patched', item: finalItem }) + '\n');
        }
        return finalItem;
      });
    }

    // Merge LLM results back into allResults for consistent response shape
    const enrichedMap = new Map(enrichedFlagged.map(r => [r.clause.id, r]));
    const finalResults = allResults.map(r => enrichedMap.get(r.clause.id) || r);

    const processingTime = Date.now() - startTime;

    if (isStream) {
      res.write(JSON.stringify({ type: 'done', processingTime, finalResults, flaggedResults: enrichedFlagged }) + '\n');
      res.end();
    } else {
      res.json({
        success: true,
        mode,
        totalClauses: clauses.length,
        flaggedCount: flaggedItems.length,
        sanitization,
        allResults: finalResults,
        flaggedResults: enrichedFlagged,
        signatureCheck,
        keyDates,
        processingTime,
      });
    }
  } catch (err) {
    // Pass typed errors to the global error handler
    if (err.name === 'IngestionError' || err.name === 'UnsupportedFileTypeError' || err.name === 'EmptyDocumentError') {
      return next(err);
    }
    // Unexpected errors
    console.error('[/api/analyze]', err);
    next(err);
  }
});

module.exports = router;
