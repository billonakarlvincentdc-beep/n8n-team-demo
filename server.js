require('dotenv').config();
const express = require('express');
const fetch = require('node-fetch');
const fs = require('fs');
const path = require('path');

const db = require('./data/db');

// Load config (config.json optional; env wins for Docker)
const configPath = path.join(__dirname, 'config.json');
let config = { port: 3099, webhook: { url: '', enabled: true } };
if (fs.existsSync(configPath)) {
  config = { ...config, ...JSON.parse(fs.readFileSync(configPath, 'utf8')) };
}
// Webhook URL: .env (local_webhook_url or LOCAL_WEBHOOK_URL) or env WEBHOOK_URL
const envWebhookUrl = process.env.local_webhook_url || process.env.LOCAL_WEBHOOK_URL || process.env.WEBHOOK_URL;
if (envWebhookUrl) config.webhook.url = envWebhookUrl.trim();
if (process.env.PORT) config.port = parseInt(process.env.PORT, 10);

let runtimeWebhookUrl = config.webhook && config.webhook.url ? config.webhook.url : '';

function getWebhookUrl() {
  return runtimeWebhookUrl || (config.webhook && config.webhook.url) || '';
}

async function sendWebhook(payload) {
  const url = getWebhookUrl();
  if (!url || !config.webhook.enabled) {
    console.log('[Webhook] Not sent (no URL or disabled). Payload:', JSON.stringify(payload, null, 2));
    return { sent: false, reason: url ? 'disabled' : 'no url' };
  }
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    console.log('[Webhook] Sent to', url, 'Status:', res.status);
    return { sent: true, status: res.status };
  } catch (err) {
    console.error('[Webhook] Error:', err.message);
    return { sent: false, error: err.message };
  }
}

const app = express();
app.use(express.json());

// Serve frontend
const publicDir = path.join(__dirname, 'public');
if (require('fs').existsSync(publicDir)) {
  app.use(express.static(publicDir));
  app.get('/', (req, res) => res.sendFile(path.join(publicDir, 'index.html')));
}

// ---------- REST APIs ----------

app.get('/api/health', (req, res) => {
  res.json({ ok: true, service: 'protocol-webhook-demo', database: db.useDatabase() ? 'postgres' : 'memory' });
});

app.get('/api/users', async (req, res) => {
  try {
    const list = await db.getUsers();
    res.json(list);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/protocols', async (req, res) => {
  try {
    const filters = {};
    if (req.query.userId) filters.userId = req.query.userId;
    if (req.query.status) filters.status = req.query.status;
    const list = await db.getProtocols(filters);
    res.json(list);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/protocols/:id', async (req, res) => {
  try {
    const p = await db.getProtocolById(req.params.id);
    if (!p) return res.status(404).json({ error: 'Protocol not found' });
    const users = await db.getUsers();
    const assignee = users.find(u => u.id === p.assigneeId);
    const openCount = await db.countOpenForUser(p.assigneeId);
    res.json({ ...p, assignee, openProtocolsRemaining: openCount });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/**
 * Complete a protocol (simulates worker finishing it).
 * Updates status to "closed", then sends webhook with remainingCount and allDone.
 */
app.post('/api/protocols/:id/complete', async (req, res) => {
  try {
    const id = req.params.id;
    const protocol = await db.getProtocolById(id);
    if (!protocol) return res.status(404).json({ error: 'Protocol not found' });
    if (!db.isOpenStatus(protocol.status)) {
      return res.status(400).json({ error: 'Protocol already completed', currentStatus: protocol.status });
    }

    const assigneeId = protocol.assigneeId;
    const openBefore = await db.countOpenForUser(assigneeId);
    const remainingAfter = openBefore - 1;

    const completedAt = new Date().toISOString();
    await db.updateProtocolStatus(id, 'closed', completedAt);

    const users = await db.getUsers();
    const assignee = users.find(u => u.id === assigneeId);
    const sectionsSummary = (protocol.sections || []).map(s => ({
      title: s.title,
      completed: s.completed,
      total: s.total,
      progress: s.completed + ' / ' + s.total
    }));
    const payload = {
      event: 'protocol_completed',
      protocolId: protocol.id,
      protocolTitle: protocol.title,
      userId: assigneeId,
      userName: assignee ? assignee.name : assigneeId,
      remainingCount: remainingAfter,
      allDone: remainingAfter === 0,
      completedAt,
      protocolDetails: {
        siteName: protocol.siteName || null,
        turbineId: protocol.turbineId || null,
        date: protocol.date || null,
        templateName: protocol.templateName || null,
        sections: sectionsSummary,
        items: (protocol.items || []).map(i => ({
          sectionPath: i.sectionPath,
          name: i.name,
          status: i.status,
          remark: i.remark || '',
          comment: i.comment || ''
        }))
      }
    };

    const webhookResult = await sendWebhook(payload);

    const updated = await db.getProtocolById(id);
    res.json({
      protocol: updated,
      webhook: payload,
      webhookSent: webhookResult.sent,
      webhookDetail: webhookResult
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/webhook-config', (req, res) => {
  const url = getWebhookUrl();
  res.json({
    url: url || null,
    enabled: config.webhook.enabled,
    source: url === runtimeWebhookUrl ? 'runtime' : (process.env.WEBHOOK_URL ? 'env' : 'config.json')
  });
});

app.post('/api/webhook-config', (req, res) => {
  const { url, enabled } = req.body || {};
  if (typeof url === 'string') runtimeWebhookUrl = url.trim();
  if (typeof enabled === 'boolean') config.webhook.enabled = enabled;
  res.json({
    url: getWebhookUrl() || null,
    enabled: config.webhook.enabled
  });
});

app.post('/api/reset', async (req, res) => {
  try {
    const count = await db.reset();
    res.json({ message: 'Mock data reset', protocolCount: count });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ---------- Start ----------
async function start() {
  await db.init();
  const port = process.env.PORT || config.port;
  app.listen(port, () => {
    console.log('Protocol Webhook Demo running at http://localhost:' + port);
    console.log('  Database:', db.useDatabase() ? 'PostgreSQL' : 'in-memory');
    console.log('  GET  /api/users');
    console.log('  GET  /api/protocols');
    console.log('  GET  /api/protocols/:id');
    console.log('  POST /api/protocols/:id/complete  -> triggers webhook');
    console.log('  GET  /api/webhook-config');
    console.log('  POST /api/webhook-config  body: { url, enabled }');
    console.log('  POST /api/reset  -> reset mock data');
    if (!getWebhookUrl()) {
      console.log('  Set webhook URL via POST /api/webhook-config, config.json, or WEBHOOK_URL env.');
    }
  });
}

start().catch(err => {
  console.error('Failed to start:', err);
  process.exit(1);
});
