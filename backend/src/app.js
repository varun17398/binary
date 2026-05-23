require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { runMigrations } = require('./db/migrations');
const { register: registerIngestHandler } = require('./events/handlers/ingestHandler');
const chatRoutes = require('./routes/chat');
const conversationRoutes = require('./routes/conversations');
const ingestRoutes = require('./routes/ingest');
const dashboardRoutes = require('./routes/dashboard');

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

app.use('/api/chat', chatRoutes);
app.use('/api/conversations', conversationRoutes);
app.use('/api/ingest', ingestRoutes);
app.use('/api/dashboard', dashboardRoutes);

app.get('/health', (req, res) => res.json({ status: 'ok' }));

async function start() {
  await runMigrations();
  registerIngestHandler();
  app.listen(PORT, () => console.log(`Backend running on http://localhost:${PORT}`));
}

start().catch(err => {
  console.error('Failed to start:', err.message);
  process.exit(1);
});
