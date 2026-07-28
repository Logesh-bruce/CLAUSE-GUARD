import express from 'express';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import mongoose from 'mongoose';
import multer from 'multer';
import path from 'path';
import fs from 'fs';

declare module 'pdf-parse';

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

const analyzeLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  message: { error: 'Too many requests, please try again later.', code: 'RATE_LIMIT_EXCEEDED' },
});

const requireApiKey = (req: express.Request, res: express.Response, next: express.NextFunction) => {
  const apiKey = req.header('x-api-key');
  const validApiKey = process.env.APP_API_KEY;
  if (!validApiKey || !apiKey || apiKey !== validApiKey) {
    return res.status(401).json({ error: 'Invalid or missing API key' });
  }
  next();
};

const storage = multer.memoryStorage();
const upload = multer({ storage, limits: { fileSize: 5 * 1024 * 1024 } });

const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/clauseguard');
    console.log('Connected to MongoDB');
  } catch (err) {
    console.error('MongoDB error:', err);
    process.exit(1);
  }
};

interface ClauseAnalysis {
  clauseText: string;
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH';
  explanation: string;
  suggestedEdit: string;
  similarityScore: number;
}

const contractSchema = new mongoose.Schema({
  fileName: String,
  rawText: String,
  clauseAnalyses: [Object],
  truncated: Boolean,
  createdAt: { type: Date, default: Date.now }
});

const Contract = mongoose.model('Contract', contractSchema);

const loadRiskySeeds = () => {
  const seedsPath = path.join(__dirname, '..', 'data', 'riskyClauseSeeds.json');
  return JSON.parse(fs.readFileSync(seedsPath, 'utf-8'));
};

const splitIntoClauses = (text: string): string[] => {
  // Simplified for now
  return text.split(/\n\s*\n/).filter(c => c.trim().length > 20).slice(0, 60);
};

const extractText = async (buffer: Buffer, fileType: string): Promise<string> => {
  if (fileType === 'txt') return buffer.toString('utf-8');
  const pdfParse = (await import('pdf-parse')).default;
  const data = await pdfParse(buffer);
  return (data as any).text || '';
};

const defaultAnalysis = (clauseText: string): ClauseAnalysis => ({
  clauseText,
  riskLevel: 'MEDIUM',
  explanation: 'Could not analyze this clause.',
  suggestedEdit: '',
  similarityScore: 0
});

const math = { sqrt: (n: number) => Math.sqrt(n) };

// Paste your full SYSTEM_PROMPT here
const SYSTEM_PROMPT = `You are ClauseGuard... (put your original long prompt here)`;

const analyzeClauseWithGroq = async (clause: string) => {
  // Keep your original function or simplify for now
  return { riskLevel: 'MEDIUM', explanation: 'Sample', suggestedEdit: '' };
};

const generateNegotiationEmail = async () => "Negotiation email placeholder";

const processBatch = async <T, R>(
  items: T[],
  processor: (item: T, index: number) => Promise<R>,
  concurrency = 5
): Promise<R[]> => {
  const results: R[] = new Array(items.length);
  let currentIndex = 0;

  const runNext = async () => {
    while (currentIndex < items.length) {
      const index = currentIndex++;
      try {
        results[index] = await processor(items[index], index);
      } catch {
        results[index] = defaultAnalysis(String(items[index])) as any;
      }
    }
  };

  const workers = Array.from({ length: Math.min(concurrency, items.length || 1) }, runNext);
  await Promise.all(workers);
  return results;
};

// Routes - Add your full routes here later
app.get('/api/contracts/health', (_, res) => res.json({ status: 'ok' }));

const start = async () => {
  await connectDB();
  app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
};

start();