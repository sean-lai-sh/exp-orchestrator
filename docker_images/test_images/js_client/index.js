const http = require('http');
const https = require('https');

const targetUrl = process.env.TARGET_URL;

if (!targetUrl) {
  console.error('[js_client] ERROR: TARGET_URL env var is required');
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

async function main() {
  const checkUrl = `${targetUrl}/check`;
  console.log(`[js_client] POST ${checkUrl}`);

  try {
    const { status, body } = await post(checkUrl, { source: 'js_client' });
    console.log(`[js_client] Response: ${status} ${body}`);

    if (status === 200) {
      console.log('[js_client] SUCCESS: /check returned 200');
      process.exit(0);
    } else {
      console.error(`[js_client] FAIL: /check returned ${status}`);
      process.exit(1);
    }
  } catch (err) {
    console.error(`[js_client] ERROR: ${err.message}`);
    process.exit(1);
  }
}

main();
