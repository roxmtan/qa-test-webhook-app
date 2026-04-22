// Import Express.js
const express = require('express');

// Create an Express app
const app = express();

// Middleware to parse JSON bodies
app.use(express.json());

// Set port and verify_token
const port = process.env.PORT || 3000;
const verifyToken = process.env.VERIFY_TOKEN;

// --- In-Memory Webhook Log Store ---
const webhookLogs = [];
const MAX_LOGS = 200;

function storeLog(entry) {
  webhookLogs.unshift(entry); // newest first
  if (webhookLogs.length > MAX_LOGS) webhookLogs.pop();
}
// --- End Log Store ---

// --- Google Sheets Logging (Optional - uncomment after Apps Script setup) ---
// const GOOGLE_SCRIPT_URL = 'YOUR_APPS_SCRIPT_URL_HERE';
//
// function logToSheet(data) {
//   fetch(GOOGLE_SCRIPT_URL, {
//     method: 'POST',
//     headers: { 'Content-Type': 'application/json' },
//     body: JSON.stringify(data)
//   }).catch(err => console.error('Sheet logging error:', err));
// }
// --- End Google Sheets Logging ---

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

  // Store the webhook payload in memory
  storeLog({
    received_at: new Date().toISOString(),
    payload: req.body
  });

  res.status(200).end();
});

// GET /logs - Returns stored webhook payloads as JSON
app.get('/logs', (req, res) => {
  const limit = Math.min(parseInt(req.query.limit) || 50, MAX_LOGS);
  const keyword = req.query.search ? req.query.search.toLowerCase() : null;

  let results = webhookLogs;

  // Optional keyword search
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
