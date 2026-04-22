// Import Express.js
const express = require('express');
const path = require('path');

// Create an Express app
const app = express();

// Middleware to parse JSON bodies
app.use(express.json());

// Enable CORS for dashboard cross-origin requests
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  next();
});

// Set port and verify_token
const port = process.env.PORT || 3000;
const verifyToken = process.env.VERIFY_TOKEN;

// --- In-Memory Webhook Log Store ---
const webhookLogs = [];
const MAX_LOGS = 200;

function storeLog(entry) {
  webhookLogs.unshift(entry);
  if (webhookLogs.length > MAX_LOGS) webhookLogs.pop();
}
// --- End Log Store ---

// --- Google Sheets Logging ---
const GOOGLE_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbyW8VlturFb-m2KTMMw1uj5dTZgOaAhQCR1LtPHLHpd8bT_qfAbuSM2-LRrY7n-uhyf/exec';

function logToSheet(data) {
  fetch(GOOGLE_SCRIPT_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  }).catch(err => console.error('Sheet logging error:', err));
}
// --- End Google Sheets Logging ---

// Serve dashboard
app.get('/dashboard', (req, res) => {
  res.sendFile(path.join(__dirname, 'dashboard.html'));
});

// Route for GET requests (webhook verification)
app.get('/', (req, res) => {
  const { 'hub.mode': mode, 'hub.challenge': challenge, 'hub.verify_token': token } = req.query;
  if (mode === 'subscribe' && token === verifyToken) {
    console.log('WEBHOOK VERIFIED');
    res.status(200).send(challenge);
  } else {
    res.status(403).end();
  }
});

// Route for POST requests (incoming webhooks)
app.post('/', (req, res) => {
  const timestamp = new Date().toISOString().replace('T', ' ').slice(0, 19);
  console.log(`\n\nWebhook received ${timestamp}\n`);
  console.log(JSON.stringify(req.body, null, 2));

  // Store in memory
  storeLog({
    received_at: new Date().toISOString(),
    payload: req.body
  });

  // Log to Google Sheets
  const body = req.body;
  const entry = body.entry && body.entry[0];
  const change = entry && entry.changes && entry.changes[0];
  const val = change && change.value;
  const msg = (val && val.messages && val.messages[0]) || (val && val.standby && val.standby.messages && val.standby.messages[0]);
  const status = val && val.statuses && val.statuses[0];

  if (msg) {
    logToSheet({
      timestamp: new Date().toISOString(),
      event_type: (change && change.field) || 'message',
      from: msg.from || '',
      to: (val && val.metadata && val.metadata.display_phone_number) || '',
      message_type: msg.type || '',
      message_body: (msg.text && msg.text.body) || msg.type || '',
      status: '',
      raw_payload: JSON.stringify(body, null, 2)
    });
  } else if (status) {
    logToSheet({
      timestamp: new Date().toISOString(),
      event_type: 'status',
      from: (val && val.metadata && val.metadata.display_phone_number) || '',
      to: status.recipient_id || '',
      message_type: '',
      message_body: '',
      status: status.status || '',
      raw_payload: JSON.stringify(body, null, 2)
    });
  } else {
    logToSheet({
      timestamp: new Date().toISOString(),
      event_type: (change && change.field) || 'unknown',
      from: '',
      to: '',
      message_type: '',
      message_body: '',
      status: '',
      raw_payload: JSON.stringify(body, null, 2)
    });
  }

  res.status(200).end();
});

// GET /logs - Returns stored webhook payloads as JSON
app.get('/logs', (req, res) => {
  const limit = Math.min(parseInt(req.query.limit) || 50, MAX_LOGS);
  const keyword = req.query.search ? req.query.search.toLowerCase() : null;

  let results = webhookLogs;

  if (keyword) {
    results = webhookLogs.filter(log =>
      JSON.stringify(log).toLowerCase().includes(keyword)
    );
  }

  results = results.slice(0, limit);

  res.json({
    total_stored: webhookLogs.length,
    returned: results.length,
    logs: results
  });
});

// Start the server
app.listen(port, () => {
  console.log(`\nListening on port ${port}\n`);
});
