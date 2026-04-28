const test = require('node:test')
const assert = require('node:assert/strict')

test('corelink-transport exports the same shape as relay-transport', () => {
  const corelink = require('../corelink-transport')
  const relay = require('../relay-transport')
  for (const fn of ['connect', 'send', 'subscribe', 'close']) {
    assert.equal(typeof corelink[fn], 'function', `corelink-transport missing ${fn}`)
    assert.equal(typeof relay[fn], 'function', `relay-transport missing ${fn}`)
  }
})
