const express = require('express');
const corelink = require('./corelink.lib.js');

const CORELINK_HOST = process.env.CORELINK_HOST || 'corelink-server';
const CORELINK_PORT = parseInt(process.env.CORELINK_PORT || '20012', 10);
const CORELINK_USERNAME = process.env.CORELINK_USERNAME || 'admin';
const CORELINK_PASSWORD = process.env.CORELINK_PASSWORD || 'Testpassword';
const NODE_ID = process.env.NODE_ID || 'publisher-1';
const WORKSPACE = process.env.OUT_JSON_WORKSPACE || 'test-workspace';
const PROTOCOL = process.env.OUT_JSON_PROTOCOL || 'ws';
const CA_PATH = process.env.CA_PATH || '/app/certs/ca-crt.pem';
const PUBLISH_INTERVAL_MS = parseInt(process.env.PUBLISH_INTERVAL_MS || '2000', 10);

const status = {
  connected: false,
  streamId: null,
  messagesSent: 0,
  nodeId: NODE_ID,
  workspace: WORKSPACE,
};

const app = express();
app.get('/health', (_req, res) => res.json({ ok: status.connected }));
app.get('/status', (_req, res) => res.json(status));
app.listen(3000, () => console.log(`[publisher] Health server on :3000`));

async function connectWithRetry(maxAttempts = 5) {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      console.log(`[publisher] Connecting to ${CORELINK_HOST}:${CORELINK_PORT} (attempt ${attempt}/${maxAttempts})`);
      await corelink.connect(
        { username: CORELINK_USERNAME, password: CORELINK_PASSWORD },
        { ControlIP: CORELINK_HOST, ControlPort: CORELINK_PORT },
        CA_PATH,
      );
      console.log('[publisher] Connected to Corelink server');
      return;
    } catch (err) {
      console.error(`[publisher] Connection attempt ${attempt} failed: ${err.message}`);
      if (attempt === maxAttempts) throw err;
      const delay = Math.min(1000 * Math.pow(2, attempt - 1), 10000);
      await new Promise((r) => setTimeout(r, delay));
    }
  }
}

async function main() {
  await connectWithRetry();
  status.connected = true;

  const streamId = await corelink.createSender({
    workspace: WORKSPACE,
    type: 'json',
    protocol: PROTOCOL,
    alert: true,
  });

  status.streamId = streamId;
  console.log(`[publisher] Sender created: streamId=${streamId}, workspace=${WORKSPACE}`);

  setInterval(() => {
    const msg = JSON.stringify({
      node_id: NODE_ID,
      seq: status.messagesSent,
      ts: Date.now(),
    });
    corelink.send(streamId, Buffer.from(msg));
    status.messagesSent++;
    if (status.messagesSent % 10 === 1) {
      console.log(`[publisher] Sent seq=${status.messagesSent - 1} to stream=${streamId}`);
    }
  }, PUBLISH_INTERVAL_MS);
}

main().catch((err) => {
  console.error(`[publisher] Fatal: ${err.message}`);
  process.exit(1);
});
