/**
 * Shared helper for fetching deployment credentials from the orchestrator.
 */

async function fetchCredentials(host, deployId, role) {
  const url = `${host}/deployments/${deployId}/credentials?role=${role}`
  const resp = await fetch(url)
  if (!resp.ok) {
    throw new Error(`fetching credentials failed: ${resp.status} ${await resp.text()}`)
  }
  return resp.json()
}

function applyNatsHostOverride(credResponse, natsHost) {
  if (!credResponse.nats || !natsHost) return credResponse.nats
  return {
    ...credResponse.nats,
    host: natsHost,
    url: `nats://${natsHost}:${credResponse.nats.port}`,
  }
}

module.exports = { fetchCredentials, applyNatsHostOverride }
