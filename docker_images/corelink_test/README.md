# Corelink Test Primitives

Dockerized Corelink server, publisher, and subscriber for local orchestration testing.

## Architecture

```
publisher ──(ws publish)──> Corelink Server <──(ws subscribe)── subscriber
   :3010                      :20012/:20013                       :3011
```

- **Corelink Server**: Real Corelink broker (from `~/corelink-server`), runs in Docker with pre-seeded SQLite DB
- **Publisher**: Connects to server, creates a sender stream, publishes JSON messages every 2s
- **Subscriber**: Connects to server, creates a receiver stream, tracks incoming messages

All three use the same env var contract as `deployment.py`'s `build_env_vars()` output (`OUT_JSON_WORKSPACE`, `IN_JSON_WORKSPACE`, `NODE_ID`, etc.).

## Prerequisites

- Docker and Docker Compose v2
- `openssl` (for cert generation)
- `~/corelink-server/` repository cloned locally
- `~/corelink-client-webrtc/` repository cloned locally (client lib already copied to `lib/`)

## Setup

### 1. Generate SSL certificates

The Corelink server requires TLS. These certs include `corelink-server` as a SAN so Docker containers can connect by hostname.

```bash
cd docker_images/corelink_test/certs
./generate-certs.sh
```

### 2. Configure corelink-server path

```bash
cd docker_images/corelink_test
cp .env.example .env
# Edit .env to set CORELINK_SERVER_PATH if not ~/corelink-server
```

### 3. Update client library (if needed)

The client library is checked in at `lib/corelink.lib.js`. To refresh from upstream:

```bash
cp ~/corelink-client-webrtc/javascript/corelink.lib.js docker_images/corelink_test/lib/
```

## Running

```bash
cd docker_images/corelink_test
docker compose up --build
```

## Validating

```bash
# Publisher health
curl http://localhost:3010/health
# {"ok":true}

# Subscriber health  
curl http://localhost:3011/health
# {"ok":true}

# Subscriber message count (should increase over time)
curl http://localhost:3011/status
# {"connected":true,"streamId":1,"messagesReceived":5,"lastMessage":{"node_id":"publisher-1","seq":4,"ts":1713...},...}

# Publisher message count
curl http://localhost:3010/status
# {"connected":true,"streamId":0,"messagesSent":5,...}
```

## Integration Test

```bash
cd backend
CORELINK_SERVER_PATH=~/corelink-server python test_corelink_deploy.py
```

The test builds all images, starts the containers, verifies the subscriber receives messages from the publisher through the Corelink server, then cleans up.

## Environment Variables

### Publisher

| Variable | Description | Default |
|----------|-------------|---------|
| `CORELINK_HOST` | Server hostname | `corelink-server` |
| `CORELINK_PORT` | WSS control port | `20012` |
| `CORELINK_USERNAME` | Auth username | `admin` |
| `CORELINK_PASSWORD` | Auth password | `Testpassword` |
| `NODE_ID` | Node identity | `publisher-1` |
| `OUT_JSON_WORKSPACE` | Sender workspace | `test-workspace` |
| `OUT_JSON_PROTOCOL` | Data protocol (ws/tcp/udp) | `ws` |
| `CA_PATH` | Path to CA cert inside container | `/app/certs/ca-crt.pem` |
| `PUBLISH_INTERVAL_MS` | Publish frequency | `2000` |

### Subscriber

**Note**: The subscriber must use a different Corelink user than the publisher. Corelink skips streams from the same user by default (the `echo` flag). The seeded DB includes `admin`, `Testuser`, `Testuser1`, etc., all with password `Testpassword`.

| Variable | Description | Default |
|----------|-------------|---------|
| `CORELINK_HOST` | Server hostname | `corelink-server` |
| `CORELINK_PORT` | WSS control port | `20012` |
| `CORELINK_USERNAME` | Auth username | `Testuser` |
| `CORELINK_PASSWORD` | Auth password | `Testpassword` |
| `NODE_ID` | Node identity | `subscriber-1` |
| `IN_JSON_WORKSPACE` | Receiver workspace | `test-workspace` |
| `IN_JSON_PROTOCOL` | Data protocol (ws/tcp/udp) | `ws` |
| `CA_PATH` | Path to CA cert inside container | `/app/certs/ca-crt.pem` |

## How This Fits Into Orchestration

These primitives validate that the env var contract from `deployment.py` works end-to-end through a real Corelink broker. The deployment pipeline generates `IN_*`/`OUT_*` env vars per DAG edge — these containers consume those exact vars.

Corelink is one transport option. For 1:1 edges, direct TCP/UDP connections may be more appropriate. The orchestrator should eventually auto-detect topology and choose the right transport per edge.
