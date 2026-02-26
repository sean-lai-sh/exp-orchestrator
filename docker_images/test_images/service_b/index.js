const express = require('express');

const app = express();
app.use(express.json());

let goodReceived = false;

app.get('/health', (_req, res) => res.json({ ok: true }));

app.post('/good', (req, res) => {
  console.log('[service_b] Received POST /good');
  goodReceived = true;
  res.status(200).json({ status: 'ok' });
});

app.get('/status', (_req, res) => {
  console.log(`[service_b] GET /status → received=${goodReceived}`);
  res.status(200).json({ received: goodReceived });
});

app.listen(3000, () => {
  console.log('[service_b] Listening on port 3000');
});
