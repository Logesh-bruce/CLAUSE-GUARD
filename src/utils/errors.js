/**
 * Typed error classes for graceful degradation.
 * All errors surface a user-readable `userMessage` that the API will forward to the frontend.
 */

class ClauseGuardError extends Error {
  constructor(message, userMessage, status = 500) {
    super(message);
    this.name = 'ClauseGuardError';
    this.userMessage = userMessage;
    this.status = status;
  }
}

class IngestionError extends ClauseGuardError {
  constructor(message, userMessage) {
    super(message, userMessage || 'Could not parse the uploaded document. Please ensure it is a valid PDF, DOCX, or TXT file.', 422);
    this.name = 'IngestionError';
  }
}

class UnsupportedFileTypeError extends ClauseGuardError {
  constructor(mimetype) {
    super(
      `Unsupported file type: ${mimetype}`,
      `File type not supported. Please upload a .pdf, .docx, or .txt file.`,
      415
    );
    this.name = 'UnsupportedFileTypeError';
  }
}

class EmptyDocumentError extends ClauseGuardError {
  constructor() {
    super(
      'Document contained no extractable text',
      'The uploaded document appears to be empty or contains no readable text.',
      422
    );
    this.name = 'EmptyDocumentError';
  }
}

class LLMError extends ClauseGuardError {
  constructor(message) {
    super(
      message,
      'The AI reasoning service is temporarily unavailable. Risk flags are shown but explanations could not be generated.',
      503
    );
    this.name = 'LLMError';
  }
}

module.exports = { ClauseGuardError, IngestionError, UnsupportedFileTypeError, EmptyDocumentError, LLMError };
