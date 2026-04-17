const express = require('express');
const corelink = require('./corelink.lib.js');

const CORELINK_HOST = process.env.CORELINK_HOST || 'corelink-server';
const CORELINK_PORT = parseInt(process.env.CORELINK_PORT || '20012', 10);
const CORELINK_USERNAME = process.env.CORELINK_USERNAME || 'Testuser';
const CORELINK_PASSWORD = process.env.CORELINK_PASSWORD || 'Testpassword';
const NODE_ID = process.env.NODE_ID || 'subscriber-1';
const WORKSPACE = process.env.IN_JSON_WORKSPACE || 'test-workspace';
const PROTOCOL = process.env.IN_JSON_PROTOCOL || 'ws';
const CA_PATH = process.env.CA_PATH || '/app/certs/ca-crt.pem';

const status = {
  connected: false,
  streamId: null,
  messagesReceived: 0,
  lastMessage: null,
  nodeId: NODE_ID,
  workspace: WORKSPACE,
};

const app = express();
app.get('/health', (_req, res) => res.json({ ok: status.connected }));
app.get('/status', (_req, res) => res.json(status));
app.listen(3000, () => console.log(`[subscriber] Health server on :3000`));

corelink.on('data', (streamId, data, _header) => {
  status.messagesReceived++;
  try {
    status.lastMessage = JSON.parse(data.toString());
  } catch {
    status.lastMessage = data.toString();
  }
  if (status.messagesReceived % 10 === 1) {
    console.log(`[subscriber] Received msg #${status.messagesReceived} from stream=${streamId}: ${data.toString().slice(0, 200)}`);
  }
});

corelink.on('receiver', async (info) => {
  console.log(`[subscriber] New stream available:`, JSON.stringify(info));
  if (info.streamID) {
    try {
      const streamList = await corelink.subscribe({ streamIDs: [info.streamID] });
      console.log(`[subscriber] Subscribed to stream ${info.streamID}:`, JSON.stringify(streamList));
    } catch (err) {
      console.error(`[subscriber] Failed to subscribe to stream ${info.streamID}: ${err.message}`);
    }
  }
});

async function connectWithRetry(maxAttempts = 5) {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      console.log(`[subscriber] Connecting to ${CORELINK_HOST}:${CORELINK_PORT} (attempt ${attempt}/${maxAttempts})`);
      await corelink.connect(
        { username: CORELINK_USERNAME, password: CORELINK_PASSWORD },
        { ControlIP: CORELINK_HOST, ControlPort: CORELINK_PORT },
        CA_PATH,
      );
      console.log('[subscriber] Connected to Corelink server');
      return;
    } catch (err) {
      console.error(`[subscriber] Connection attempt ${attempt} failed: ${err.message}`);
      if (attempt === maxAttempts) throw err;
      const delay = Math.min(1000 * Math.pow(2, attempt - 1), 10000);
      await new Promise((r) => setTimeout(r, delay));
    }
  }
}

async function main() {
  await connectWithRetry();
  status.connected = true;

  const streamList = await corelink.createReceiver({
    workspace: WORKSPACE,
    type: ['json'],
    protocol: PROTOCOL,
    alert: true,
  });

  status.streamId = corelink.getReceiverID();
  console.log(`[subscriber] Receiver created: workspace=${WORKSPACE}, existing streams:`, JSON.stringify(streamList));
}

main().catch((err) => {
  console.error(`[subscriber] Fatal: ${err.message}`);
  process.exit(1);
});
