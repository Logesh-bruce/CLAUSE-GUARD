require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const analyzeRouter = require('./routes/analyze');
const exportRouter = require('./routes/export');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, '../public')));

// Routes
app.use('/api/analyze', analyzeRouter);
app.use('/api/export', exportRouter);

// Health check — for uptime monitoring and load balancer probes
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
    llmConfigured: Boolean(process.env.GROQ_API_KEY),
  });
});

// Serve landing page
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/landing.html'));
});

// Serve app
app.get('/app', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

// Global error handler — ensures no silent crashes
app.use((err, req, res, next) => {
  console.error('[ClauseGuard Error]', err.message || err);
  const status = err.status || 500;
  const message = err.userMessage || 'An unexpected error occurred. Please try again.';
  res.status(status).json({ error: true, message });
});

app.listen(PORT, () => {
  console.log(`\n🛡️  ClauseGuard running at http://localhost:${PORT}`);
  if (!process.env.GROQ_API_KEY) {
    console.warn('⚠️  WARNING: GROQ_API_KEY not set in .env — LLM reasoning will fail.');
  }
});
