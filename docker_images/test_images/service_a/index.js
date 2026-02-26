const express = require('express');
const http = require('http');
const https = require('https');

const app = express();
app.use(express.json());

const nextServiceUrl = process.env.NEXT_SERVICE_URL;

if (!nextServiceUrl) {
  console.error('[service_a] ERROR: NEXT_SERVICE_URL env var is required');
  process.exit(1);
}

function post(urlStr, body) {
  return new Promise((resolve, reject) => {
    const url = new URL(urlStr);
    const data = JSON.stringify(body);
    const mod = url.protocol === 'https:' ? https : http;

    const req = mod.request(
      {
        hostname: url.hostname,
        port: url.port || (url.protocol === 'https:' ? 443 : 80),
        path: url.pathname,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(data),
        },
      },
      (res) => {
        let raw = '';
        res.on('data', (c) => (raw += c));
        res.on('end', () => resolve({ status: res.statusCode, body: raw }));
      }
    );

    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

app.get('/health', (_req, res) => res.json({ ok: true }));

app.post('/check', async (req, res) => {
  console.log('[service_a] Received POST /check');

  // Respond immediately with 200
  res.status(200).json({ status: 'ok' });

  // Forward to service_b /good
  const goodUrl = `${nextServiceUrl}/good`;
  console.log(`[service_a] Forwarding POST to ${goodUrl}`);

  try {
    const { status } = await post(goodUrl, { source: 'service_a' });
    console.log(`[service_a] /good responded with ${status}`);
  } catch (err) {
    console.error(`[service_a] Failed to forward to /good: ${err.message}`);
  }
});

app.listen(3000, () => {
  console.log('[service_a] Listening on port 3000');
  console.log(`[service_a] Will forward /good to: ${nextServiceUrl}`);
});
