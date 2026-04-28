
/* eslint-disable no-async-promise-executor */
/* eslint-disable no-restricted-syntax */


/**
 * @file NodeJS client library for Corelink
 * @author Robert Pahle, Abhishek Khanna
 * @version V5.1.2
 */


// V5.1.2 changed versioning number
// V5.1.0.2 fixed server
// V5.1.0.1 fixed race condition
// V5.1.0.0 Generic function Implementation
// V5.0.0.0 TCP can also be used as Data protocol
// V4.0.0.0 Web socket can also be used as Data protocol
// V3.1.0.0 switch to websockets as default control connection
// V3.0.0.0 new data protocol
// V2.4.0.0 added initial browser checks
// V2.3.0.0 added initial autoReconnect option
// V2.2.0.0 changed receiver,sender and disconnect calls to use JSON options
// V2.1.0.0 added subscriber and dropped callbacks
// V2.0.0.0 changed to json syntax for createSender, createReceiver and

// set debug to true for additional error reporting
let debug = false

// test for nodejs
if (typeof module !== 'undefined' && this.module !== module) {
  if (process.versions.node.split('.')[0] < 12) {
    console.error(`The current node version ${process.versions.node} does not meet the minimmum requirements of 12.0.0`)
    process.exit()
  }
} else { console.log('This library is designed to run in NodeJS.') }

// const { PromiseSocket } = require('promise-socket')
const WebSocket = require('websocket').w3cwebsocket
const dns = require('dns')
const fs = require('fs')
const dgram = require('dgram')
const net = require('net')
// const { client } = require('websocket')

// const headerSize = Buffer.alloc(8)

let attempts = 0
let connected = false


const receiverStream = {}
const senderStreams = []
const allowedStreams = []
const cert = {}
let token = null

let sourceIP = null
let sourcePort = null

let udpRegistered = false
let udp = null
let udpServerAddress = null
let connCredentials = null
let connConfig = null


let dataCb = null
let receiverCb = null
let senderCb = null
let staleCb = null
let droppedCb = null
let closeCb = null


/**
* Helper function to create random exponential delay to reconnect
* @param {string} data JSON string to decode.
* @returns {object} Javascript object with the parsed data
* @private
* @module parseJson
*/

function generateInterval(k) {
  let maxInterval = ((2 ** k) - 1) * 1000
  if (maxInterval > 30 * 1000) {
    maxInterval = 30 * 1000
  }
  return Math.random() * maxInterval
}


/**
* Helper function to parse JSON
* @param {string} data JSON string to decode.
* @returns {object} Javascript object with the parsed data
* @private
* @module parseJson
*/

function parseJson(data) {
  return (new Promise((resolve, reject) => {
    try {
      const parsedData = JSON.parse(`[${data.toString().replace(/}{/g, '},{')}]`)
      resolve(parsedData)
    } catch (e) {
      reject(new Error(`Received message not a proper JSON: ${data.toString()}`))
    }
  }))
}


// all control stream functions

const control = {}
control.data = []
control.ID = 0

control.connect = async (IP, port, caPath = null) => (new Promise(async (resolve, reject) => {
  const URL = `wss://${IP}:${port}/`
  if (debug) console.log(`Trying to connect to: ${URL}`)
  if (caPath != null) {
    cert.ca = fs.readFileSync(caPath)
  } else if ((IP === 'localhost' || IP === '127.0.0.1' || IP === '::1') && (typeof connConfig.cert !== 'undefined')) {
    cert.ca = fs.readFileSync(connConfig.cert)
  }
  try {
    control.client = new WebSocket(URL, null, null, null, cert)
  } catch (e) {
    console.error('Not able to connect the websocket.', e)
    reject(e)
  }

  control.client.onopen = () => {
    resolve()
  }

  control.client.onerror = (e) => {
    console.log('Connection Error:', e)
    reject()
  }

  control.request = async (data) => {
    if (debug) console.log('request', data)
    return (new Promise(async (requestResolve, requestReject) => {
      const wdata = data
      wdata.ID = control.ID
      control.ID += 1
      let retries = 5
      control.client.onmessage = (async (content) => {
        const parsed = await parseJson(content.data).catch((e) => requestReject(e))
        if (debug) console.log('parsed all', parsed)
        for (let i = 0; i < parsed.length; i += 1) {
          if ('function' in parsed[i]) {
            if (debug) console.log('call 2nd func')
            control.client.onmessage1(parsed)
          }
          retries -= 1
          if ('ID' in parsed[i] && parsed[i].ID === wdata.ID) {
            delete parsed[i].ID
            if (debug) console.log('parsed', parsed[i])
            if ('statusCode' in parsed[i]) {
              if (parsed[i].statusCode === 0) {
                requestResolve(parsed[i])
                break
              } if ('message' in parsed[i]) reject(new Error(`${parsed[i].message} (${parsed[i].statusCode})`))
              else reject(new Error(`Error (${parsed[i].statusCode}) with out specific message returned.`))
            } reject(new Error('Status code or function not found in answer.'))
          }
          if (retries === 0) requestReject(new Error('Server did not responded with an answer.'))
        }
      })
      control.client.send(JSON.stringify(wdata))
      if (debug) console.log('request sent:', JSON.stringify(wdata))
    }))
  }

  control.client.onmessage1 = (async (data) => {
    if (debug) console.log('onmessage', data)
    for (let i = 0; i < data.length; i += 1) {
      const parsedData = data[i]
      if ('function' in parsedData) {
        if (debug) console.log('function')
        switch (parsedData.function) {
          case 'update':
            if (receiverCb != null) {
              delete parsedData.function
              receiverCb(parsedData)
            } else console.log('No receiver update callback provided.')
            break
          case 'subscriber':
            if (senderCb != null) {
              delete parsedData.function
              senderCb(parsedData)
            } else console.log('No sender update callback provided.')
            break
          case 'stale':
            if (staleCb != null) {
              delete parsedData.function
              staleCb(parsedData)
            } else console.log('No stale update callback provided.')
            break
          case 'dropped':
            if (droppedCb != null) {
              delete parsedData.function
              droppedCb(parsedData)
            } else console.log('No dropped update callback provided.')
            break
          default:
            console.log('Unknown callback. Maybe this library is outdated?')
        }
      }
    }
  })

  /**
  *Call the on function with either data or close function.
  * @param {string} data The module is defined to parse JSON data. The client checks for the
                          'function' in data. The event 'update' or 'status' will be triggered
                          and accordingly 'receiver_cb' or 'stale_cb' will be checked for
                          null values.
  * @param {string} close The callback function close_cb is checked for null values and close_cb()
                          is called
  * @module on
  */

  // make connect attemps and manage exponential backoff in connection attempts
  function reconnect() {
    control.connect(connCredentials, connConfig).catch((err) => {
      console.log('Connection failed.', err)
    })
  }


  control.client.onclose = (e) => {
    if (debug) console.log('onclose:', e)
    console.log('reconnect: ', connConfig.autoReconnect)
    if (connConfig.autoReconnect) {
      if (closeCb != null) closeCb()
      else console.log('No close connection callback provided.')
      console.log(`Control connection lost: Retrying websocket (${attempts})`)
      const time = generateInterval(attempts)
      console.log(`Waiting ${time}ms to reconnect.`)
      setTimeout(() => {
        attempts += 1
        reconnect(attempts)
      }, time)
    } else
    if (closeCb != null) closeCb()
    else {
      console.log('No close connection callback provided.')
    }
  }
}))

// TCP data Stream Functions

async function receiverSetupTCP(streamID, port) {
  return (new Promise(((resolve, reject) => {
    const host = connConfig.ControlIP
    const buffer = []
    const headerSize = Buffer.alloc(8)

    receiverStream.client = new net.Socket()
    receiverStream.client.connect(port, host, () => {
      if (debug) console.log('Reciver connected to server')
      headerSize.writeUInt16LE(0, 0)
      headerSize.writeUInt16LE(0, 2)
      headerSize.writeUInt32LE(streamID, 4)
      // adding header
      if (debug) console.log('bufferlength to send:', headerSize.byteLength)
      receiverStream.client.write(headerSize)

      resolve(true)
    })

    if (debug) console.log('init packet TCP: ', headerSize.toString(), port, connConfig.ControlIP)

    receiverStream.client.on('error', (err) => {
      reject(err)
    })

    function helper(message) {
      const headSize = message.readUInt16LE(0)
      const dataSize = message.readUInt16LE(2)
      const sourceID = message.readUInt32LE(4)
      let header = message.toString('ascii', 8, headSize + 8)
      const dataR = Buffer.allocUnsafe(dataSize)
      message.copy(dataR, 0, 8 + headSize)
      if (header.length > 0) {
        try {
          header = JSON.parse(header)
        } catch (e) {
          console.log(`Received message not a proper JSON: ${message.toString()}`)
          return
        }
      } else header = {}
      dataCb(sourceID, dataR, header)
    }


    receiverStream.client.on('data', (message) => {
      if (message.length < 8) {
        console.log('Packet is too small')
        return
      }
      if (dataCb != null) {
        if (message.length === 65536) {
          buffer.push(message)
        } else if (buffer.length > 0) {
          buffer.push(message)
          let calculatedSize = 0
          let pointer = 0
          const msg = Buffer.concat(buffer)
          // for combined packets we need to match the source/federation id and the overall size
          while (buffer.length > calculatedSize) {
            calculatedSize += 8
            calculatedSize += msg.readUInt16LE(pointer)
            calculatedSize += msg.readUInt16LE(pointer + 2)
            if (msg.length < calculatedSize) {
              console.log(`Combined packet has wrong size (${msg.length} vs. ${calculatedSize}).`)
              return
            }
            const data = Buffer.allocUnsafe(calculatedSize - pointer)
            msg.copy(data, 0, pointer, calculatedSize)
            helper(data)
            pointer = calculatedSize
          }

          if (msg.length !== calculatedSize) {
            console.log(`Combined packet has still the wrong size (${msg.length} vs. ${calculatedSize}).`)
          }
        } else {
          helper(message)
        }
      } else console.log('Data received, but no callback for data available.')
    })
  })))
}

async function senderSetupTCP(streamID = null, port = null) {
  return (new Promise(((resolve, reject) => {
    const host = connConfig.ControlIP
    if (debug) console.log('setting up data TCP', 'streamID', streamID, 'port', port, `Trying to connect to: ${URL}`)

    try {
      senderStreams[streamID].client = new net.Socket()
      senderStreams[streamID].client.connect(port, host, () => {
        if (debug) console.log('sender connected to server')
        resolve(true)
      })
    } catch (e) {
      console.error('Not able to connect the TCP for Data Stream.', e)
      if (debug) console.error('sender Streams', senderStreams)
      reject(e)
    }
    senderStreams[streamID].client.on('error', (err) => {
      reject(err)
    })
  })))
}

// WS data Stream Functions


async function receiverSetupWS(streamID = null, port = null) {
  return (new Promise(((resolve, reject) => {
    const IP = connConfig.ControlIP
    const URL = `wss://${IP}:${port}/`
    const headerSize = Buffer.alloc(8)

    if (debug) console.log('setting up data WS', 'streamID', streamID, 'port', port, `Trying to connect to: ${URL}`)
    try {
      receiverStream.client = new WebSocket(URL, null, null, null, cert)
    } catch (e) {
      console.error('Not able to connect the websocket for Data Stream.', e)
      if (debug) console.error('receiverStream', receiverStream)
      reject(e)
    }

    receiverStream.client.addEventListener('open', () => {
      headerSize.writeUInt16LE(0, 0)
      headerSize.writeUInt16LE(0, 2)
      headerSize.writeUInt32LE(streamID, 4)
      // adding header
      console.log('bufferlength to send:', headerSize.byteLength)

      receiverStream.client.send(headerSize)

      resolve(token)
    })

    receiverStream.client.addEventListener('error', (err) => {
      reject(err)
    })

    receiverStream.client.addEventListener('message', (message) => {
      if (dataCb != null) {
        const data = Buffer.from(message.data)
        const headSize = data.readUInt16LE(0)
        const dataSize = data.readUInt16LE(2)
        const sourceID = data.readUInt32LE(4)
        let header = data.toString('ascii', 8, headSize + 8)
        const dataR = Buffer.allocUnsafe(dataSize)
        data.copy(dataR, 0, 8 + headSize)
        if (header.length > 0) {
          try {
            header = JSON.parse(header)
          } catch (e) {
            console.log(`Received message not a proper JSON: ${message.toString()}`)
            return
          }
        } else header = {}
        dataCb(sourceID, dataR, header)
      } else console.log('Data received, but no callback for data available.')
    })
  })))
}


async function senderSetupWS(streamID = null, port = null) {
  return (new Promise(((resolve, reject) => {
    const IP = connConfig.ControlIP
    const URL = `wss://${IP}:${port}/`
    if (debug) console.log('setting up data WS', 'streamID', streamID, 'port', port, `Trying to connect to: ${URL}`)
    try {
      senderStreams[streamID].client = new WebSocket(URL, null, null, null, cert)
    } catch (e) {
      console.error('Not able to connect the websocket for Data Stream.', e)
      if (debug) console.error('sender Streams', senderStreams)
      reject(e)
    }

    senderStreams[streamID].client.addEventListener('open', () => {
      resolve(true)
    })

    senderStreams[streamID].client.addEventListener('error', (err) => {
      reject(err)
    })
  })))
}


// UDP data stream functions

function receiverSetupUDP(streamID, port) {
  const headerSize = Buffer.alloc(8)
  headerSize.writeUInt16LE(0, 0)
  headerSize.writeUInt16LE(0, 2)
  headerSize.writeUInt32LE(streamID, 4)

  if (debug) console.log('init packet UDP: ', headerSize.toString(), port, connConfig.ControlIP)
  udp.send(headerSize, port, connConfig.ControlIP, (err) => {
    if (debug) console.log('Initializing Receiver UDP...')
    if (err) console.log('socket error', err)
  })
}

async function setupUDP(streamID = null, port = null) {
  return (new Promise(((resolve, reject) => {
    if (debug) console.log('setting up UDP', 'streamID', streamID, 'port', port)
    udp = dgram.createSocket('udp4')
    udp.bind()
    udp.on('listening', () => {
      const address = udp.address()
      sourcePort = address.port
      if (debug) console.log(`Bound to UDP port ${sourcePort}.`)
      udpRegistered = true
      dns.lookup(connConfig.ControlIP, (err, serverAddress) => {
        if (debug) console.log(`err: ${err}`)
        udpServerAddress = serverAddress
        if (debug) console.log('address:', udpServerAddress)
      })
      if ((streamID != null) && (port != null)) {
        receiverSetupUDP(streamID, port)
      }
      resolve(true)
    })
    udp.on('error', (err) => {
      reject(err)
    })
    udp.on('message', (message, info) => {
      if (dataCb != null) {
        const headSize = message.readUInt16LE(0)
        const dataSize = message.readUInt16LE(2)
        const sourceID = message.readUInt32LE(4)
        let header = message.toString('ascii', 8, headSize + 8)
        const dataR = Buffer.allocUnsafe(dataSize)
        message.copy(dataR, 0, 8 + headSize)
        if (header.length > 0) {
          try {
            header = JSON.parse(header)
          } catch (e) {
            console.log(`Received message not a proper JSON: ${message.toString()}`)
            return
          }
        } else header = {}

        // if (debug) console.log('streams: ', allowedStreams[0], sourceID, ' IP\'s: ',
        // connConfig.ControlIP, info.address, ' ports:', receiverStream.port, info.port)

        // if (debug) console.log(`IP address comparison: ${info.address} , ${udpServerAddress}`)
        if ((info.address === udpServerAddress)
           && allowedStreams.includes(sourceID)
           && (receiverStream.port === info.port)) dataCb(sourceID, dataR, header)
        else console.log(`packet from unauthorized address ${info.address}:${info.port}`)
      } else console.log('Data received, but no callback for data available.')
    })
  })))
}

/**
 *The function first checks if the array of streamIDs is not empty as well as
 *the protocol set up is UDP. After the header and packet are defined, the
 *message is send at the appropriate port number and target IP.
 *@param {String} streamID  Allows a user to select streams to Subscribe to.
  If StreamID is not given, all streams are sent
 *@param {String} data Refers to the data to be sent.
 *@param {object} _header Is a JSON object that will be placed in the header
    in general these could be arbitrary information,
    however, several tags will be decoded
  - stamp: the server will fill in the server time stamp
  - limit: array of receiver ids, the server will send the packet only to these id's
 *@module send
 */

// eslint-disable-next-line no-unused-vars
function send(streamID, data, header) {
  const headerSize = Buffer.alloc(8)
  headerSize.writeUInt16LE(0, 0)
  headerSize.writeUInt16LE(data.length, 2)
  headerSize.writeUInt32LE(streamID, 4)
  const packet = [headerSize, data]
  const message = Buffer.concat(packet)
  // TCP
  if ((typeof senderStreams[streamID] !== 'undefined') && (senderStreams[streamID].protocol === 'tcp')) {
    try {
      senderStreams[streamID].client.write(message)
    } catch (e) {
      console.log('socket error', e)
    }
  }

  // WS
  if ((typeof senderStreams[streamID] !== 'undefined') && (senderStreams[streamID].protocol === 'ws')) {
    try {
      senderStreams[streamID].client.send(message)
    } catch (e) {
      console.log('socket error', e)
    }
  }

  // UDP
  if ((typeof senderStreams[streamID] !== 'undefined') && (senderStreams[streamID].protocol === 'udp')) {
    // ToDo: add headers based on requirements (e.g. Stamp)
    /*
    let headerData = ''
    if ((typeof header === 'object') && (header !== {})) headerData = JSON.stringify(header)
    headerData = Buffer.from(header)
    */
    if (udpRegistered) {
      udp.send(message, senderStreams[streamID].port, connConfig.ControlIP,
        (err) => {
          if (err) console.log('socket error', err)
          else if (debug) console.log(`sent: h0,d${data.length}, none, ${connConfig.ControlIP}:${senderStreams[streamID].port}`)
        })
    } else console.log('UDP unregistered')
  }

  if (debug) console.log(`sent: ID${streamID} h${0},d${data.byteLength}`)
}


/**
 *Requests a 'sender' function from Corelink protocol which  needs input like
 *workspace,protocol,Source IP, token etc. The client awaits to read, after
 *which it parses the JSON data. The statusCode checks for streamID,port,MTU
 *and message in the content. After getting values for workspace,protocol,type
 *and metadata, UDP protocol is set up. The function expects and object with the
 *following parameters:
 *@param {String} workspace Workspaces are used to separate out groups of streams
  so that several independent groups of researchers can work together.
 *@param {String} protocol  Protocol for the stream to use (UDP/TCP/WS)
 *@param {String} type type information can be freely selected.But well known
  formats will be published.At the moment those are 3d, audio.
 *@param {String} metadata Information about data
 *@param {String} from sender information
 *@module createSender
 */

async function createSender(options) {
  return (new Promise(async (resolve, reject) => {
    const workOptions = options
    // checking inputs
    if (!('workspace' in workOptions)) reject(new Error('Workspace not found.'))
    if (!('type' in workOptions)) reject(new Error('Type not defined.'))
    if (!('protocol' in workOptions)) workOptions.protocol = 'udp'
    if (!('metadata' in workOptions)) workOptions.metadata = ''
    if (!('from' in workOptions)) workOptions.from = ''
    if (!('alert' in workOptions)) workOptions.alert = false

    const request = `{"function":"sender","workspace":"${workOptions.workspace}","proto":"${workOptions.protocol}","IP":"${sourceIP}","port":0,"alert":${workOptions.alert},"type":"${workOptions.type}","meta":${JSON.stringify(workOptions.metadata)},"from":"${workOptions.from}","token":"${token}"}`
    const content = await control.request(JSON.parse(request)).catch((e) => reject(e))
    if (debug) console.log('CreateSender Result:', content)

    if ('streamID' in content) senderStreams[content.streamID] = []
    else reject(new Error('StreamID not found.'))
    if ('port' in content) senderStreams[content.streamID].port = content.port
    else reject(new Error('Target port not found.'))
    if ('MTU' in content) senderStreams[content.streamID].MTU = content.MTU
    else reject(new Error('Target MTU not found.'))

    senderStreams[content.streamID].workspace = workOptions.workspace
    senderStreams[content.streamID].protocol = workOptions.protocol
    senderStreams[content.streamID].type = workOptions.type
    senderStreams[content.streamID].metadata = workOptions.metadata
    senderStreams[content.streamID].from = workOptions.from
    senderStreams[content.streamID].alert = workOptions.alert
    if (debug) console.log('create sender sender STream', senderStreams)

    if ((workOptions.protocol === 'udp') && (!udpRegistered)) await setupUDP().catch((err) => { console.log(err) })
    if (workOptions.protocol === 'ws') await senderSetupWS(content.streamID, content.port).catch((err) => { console.log(err) })
    if (workOptions.protocol === 'tcp') await senderSetupTCP(content.streamID, content.port).catch((err) => { console.log(err) })

    if (debug) console.log('createSender returns:', content.streamID)
    resolve(content.streamID)
  }))
}


/**
 *It takes parameters streamID and port and requests a receiver function from
 *Corelink protocol which has inputs workspace name, streamID,source IP,token etc.
 *Further,it checks for statusCode,streamID,port,potocol,streamList,MTU. UDP
 *protocol is the set up on receiver's side. The function expects and object with the
 *following parameters:
 *@param {String} workspace Workspaces are used to separate out groups of streams
  so that several independent groups of researchers can work together.
 *@param {String} protocol Protocol for the stream to use (UDP/TCP/WS)
 *@param {String} streamIDs Allows a user to select streams to Subscribe to.
  If StreamID is not given, all streams are sent
 *@param {String} type type information can be freely selected.But well known
  formats will be published.At the moment those are 3d, audio.
 *@param {String} alert alert is an optional argument that false,if new streams
  of this type are registered will send the streamID’s to the client via server
  initiated controlFunction (default is false)
 *@param {String} echo receive data that was sent by the same user (default is false)
 *@param {String} receiverID Receiver streamID to remove streams from
 *@module createReceiver
 */

async function createReceiver(options) {
  return (new Promise((async (resolve, reject) => {
    // checking inputs
    const workOptions = options

    if (!('workspace' in workOptions)) reject(new Error('Workspace not found.'))
    if (!('protocol' in workOptions)) workOptions.protocol = 'udp'
    if (!('streamIDs' in workOptions)) workOptions.streamIDs = []
    if (!('type' in workOptions)) workOptions.type = []
    if (!('alert' in workOptions)) workOptions.alert = false
    if (!('echo' in workOptions)) workOptions.echo = false

    const request = `{"function":"receiver","workspace":"${workOptions.workspace}","streamIDs":${JSON.stringify(workOptions.streamIDs)},"proto":"${workOptions.protocol}","IP":"${sourceIP}","port":0,"echo":${workOptions.echo},"alert":${workOptions.alert},"type":${JSON.stringify(workOptions.type)},"token":"${token}"}`
    if (debug) console.log('createReceiver request', request)
    const content = await control.request(JSON.parse(request)).catch((e) => reject(e))
    if (debug) console.log('create Receiver content', content)

    if ('streamID' in content) receiverStream.streamID = content.streamID
    else reject(new Error('StreamID not found.'))
    if (debug) console.log(`createReceiver port: ${content.port}`)
    if ('port' in content) receiverStream.port = content.port
    else reject(new Error('Target port not found.'))
    if ('proto' in content) receiverStream.proto = content.proto
    else reject(new Error('Target proto not found.'))
    if ('streamList' in content) receiverStream.streamList = content.streamList
    else reject(new Error('Target streamList not found.'))
    if ('MTU' in content) receiverStream.MTU = content.MTU
    else reject(new Error('Target MTU not found.'))

    receiverStream.workspace = workOptions.workspace
    receiverStream.protocol = workOptions.protocol
    receiverStream.type = workOptions.type
    receiverStream.alert = workOptions.alert
    receiverStream.echo = workOptions.echo

    for (const stream in content.streamList) {
      if (!allowedStreams.includes(content.streamList[stream].streamID)) {
        allowedStreams.push(content.streamList[stream].streamID)
      }
    }

    if ((workOptions.protocol === 'udp') && (udpRegistered)) receiverSetupUDP(content.streamID, content.port)
    if ((workOptions.protocol === 'udp') && (!udpRegistered)) await setupUDP(content.streamID, content.port).catch((err) => { console.log(err) })
    if (workOptions.protocol === 'tcp') await receiverSetupTCP(content.streamID, content.port).catch((err) => { console.log(err) })
    if (workOptions.protocol === 'ws') await receiverSetupWS(content.streamID, content.port).catch((err) => { console.log(err) })

    resolve(content.streamList)
  })))
}

// Begin Common Functions

/**
 *set the debug variable to enable enhanced debug output
 *@param {boolean} flag A boolen that will set the enhanced debug functionality
 *@module setDebug
 */

function setDebug(flag) {
  debug = flag
}


/**
 *Login to the corelink server
 *with username and password or token
 *If the credentials are incorrect then it throws an error.
 *The module ends with a
  Promise. A promise is an object which can be returned synchronously from an asynchronous function.
 *@param {String} credentials Refers to all login credentials like username,password and token.
 *@module login
 */

async function login(credentials) {
  return (new Promise(async (resolve, reject) => {
    let request = ''
    if ((typeof credentials.username === 'undefined')
            && (typeof credentials.password === 'undefined')) {
      if ((typeof credentials.token === 'undefined')) reject(new Error('Credentials not found.'))
      else request = `{"function":"auth","token":"${credentials.token}"}`
    } else request = `{"function":"auth","username":"${credentials.username}","password":"${credentials.password}"}`
    if (debug) console.log('Login ', request)
    const content = await control.request(JSON.parse(request)).catch((e) => reject(e))
    if (!content) return
    if (debug) console.log('Login result ', content)
    if ('token' in content) token = content.token
    else reject(new Error('Token not found.'))
    if ('IP' in content) sourceIP = content.IP
    else reject(new Error('SourceIP not found.'))
    resolve(true)
  }))
}


/**
 *Connects with client at the specified Port and IP number after verifying login credentials
 *like username,password and token defined in the 'login' function.
 *If the credentials are incorrect then it throws an error.
 *The 'await' keyword waits for a value of ControlPort and ControlIP. The module ends with a
  Promise. A promise is an object which can be returned synchronously from an asynchronous function.
 *@param {String} credentials Refers to all login credentials like username,password and token.
 *@param {String} config Refers to connection configuration like ControlPort and ControlIP

 *@module connect
 */

async function connect(credentials, config, caPath = null) {
  return (new Promise(async (resolve, reject) => {
    if (debug) console.log('Connecting...')
    connConfig = config

    connCredentials = credentials

    // dns.lookup(connConfig.ControlIP, (err, address) => {
    //   connConfig.ControlIP = address
    //   if (debug) console.log('address:', address)
    // })

    if (debug) console.log('Target IP:', connConfig.ControlIP, 'target port :', connConfig.ControlPort)
    let conn
    connected = true
    // connect the client
    await control.connect(connConfig.ControlIP, connConfig.ControlPort, caPath).catch((e) => {
      connected = false
      if (debug) console.log('not connectd', e)
      reject(e)
    })

    if (connected) {
      // check if there is a token and if it is valid
      // checkToken()

      // login if we dont have a good token
      if (token == null) conn = await login(credentials).catch((e) => reject(e))

      // if all streams are still valid
      // if (conn) checkConnections()
    }
    if (conn) {
      attempts = 1
      resolve(conn)
    } else reject(new Error('Problem loggin in'))
  }))
}

/**
 *Queries the corelink relay for available User
 *@param {string} config the parameter name that should be set
 *@param {string} context context that this cofiguration applies to global (server global
                  settings), profile (global user specific settings), app (app global
                  settings), or private (app user specific settings), if omitted or empty
                  it is a global configuration parameter
 *@param {string} app name of the app that this cofiguration applies to, can be omitted or
                  empty for global or profile configuration parameters
 *@param {string} plugin name of the plugin that this cofiguration applies to, can be omitted or
                  empty for global or profile configuration parameters
 *@param {string} user name of the user that this cofiguration applies to, can be omitted
                  or empty for global or app configuration parameters, only an admin can
                  set this parameter, otherwise the logged in username will be taken.'
 *@param {string} value value to apply to the parameter, all parameters are stored as strings,
                  but are applied in the defined type',
 *@exports setConfig
 *@module setConfig
 */

async function setConfig(options) {
  return (new Promise(async (resolve, reject) => {
    const request = options
    if (!('config' in request)) { reject(new Error('Name of the configuration parameter required.')); return }
    if (!('value' in request)) { reject(new Error('Context of the configuration parameter required.')); return }
    if (!('context' in request) || (request === '')) { request.context = 'global' }
    if (!('app' in request)) { request.app = '' }
    if (!('plugin' in request)) { request.plugin = '' }
    if (!('user' in request)) { request.user = '' }
    request.function = 'setConfig'
    request.token = token
    console.log(request)
    await control.request(request).catch((e) => reject(e))
    resolve(true)
  }))
}

// User management functions

/**
 *Queries the corelink relay to add a user
 *@param {String} username  name that you would like to add
 *@param {String} password  password of the user that you would like to add
 *@param {String} email  emailid of the user that you would like to add
 *@param {String} first  name that you would like to add
 *@param {String} last  name that you would like to add
 *@param {boolean} admin  admin property of the new user
 *@exports addUser
 *@module addUser
 */

async function addUser(options) {
  return (new Promise(async (resolve, reject) => {
    const workOptions = options
    // checking inputs
    if (!('username' in workOptions)) {
      reject(new Error('user not found.'))
      return
    }
    if (!('password' in workOptions)) {
      reject(new Error('password not found.'))
      return
    }
    if (!('email' in workOptions)) {
      reject(new Error('email name not defined.'))
      return
    }
    if (!('first' in workOptions)) workOptions.first = workOptions.username
    if (!('last' in workOptions)) workOptions.last = workOptions.username
    if (!('admin' in workOptions)) workOptions.admin = false
    const request = `{"function":"addUser","username":"${workOptions.username}","password":"${workOptions.password}","first":"${workOptions.first}",
    "email":"${workOptions.email}","last":"${workOptions.last}","admin":${workOptions.admin},"token":"${token}"}`
    await control.request(JSON.parse(request)).catch((e) => reject(e))
    resolve(true)
  }))
}

/**
 *Queries the corelink relay to change the password of the user
 *@param {String} password password that need to be change
 *@exports password
 *@module password
 */
async function password(options) {
  return (new Promise(async (resolve, reject) => {
    const workOptions = options
    // checking inputs
    if (!('password' in workOptions)) {
      reject(new Error('password not found.'))
      return
    }
    const request = `{"function":"password","password":"${workOptions.password}","token":"${token}"}`
    await control.request(JSON.parse(request)).catch((e) => reject(e))
    resolve(true)
  }))
}

/**
 *Queries the corelink relay to remove a user
 *@param {String} username  user name that you would like to remove
 *@exports rmUser
 *@module rmUser
 */

async function rmUser(options) {
  return (new Promise(async (resolve, reject) => {
    const workOptions = options
    // checking inputs
    if (!('username' in workOptions)) {
      reject(new Error('username not given.'))
      return
    }
    const request = `{"function":"rmUser","username":"${workOptions.username}","token":"${token}"}`
    await control.request(JSON.parse(request)).catch((e) => reject(e))
    resolve(true)
  }))
}

/**
 *Queries the corelink relay for available User
 *@returns {Array} Array of User, empty array if no User are available
 *@exports listUsers
 *@module listUsers
 */

async function listUsers() {
  return (new Promise(async (resolve, reject) => {
    const request = `{"function":"listUsers","token":"${token}"}`
    const content = await control.request(JSON.parse(request)).catch((e) => reject(e))
    if ('userList' in content) resolve(content.userList)
    else reject(new Error('Users not found.'))
  }))
}

// Group management functions:


/**
 *Queries the corelink relay to add a user to group(login user should either admin/ owner)
 *@param {String} User  name that you would like to user to group
 *@param {String} group  Groupname that will have a new user
 *@module addUserGroup
 */

async function addUserGroup(options) {
  return (new Promise(async (resolve, reject) => {
    const workOptions = options
    // checking inputs
    if (!('username' in workOptions)) reject(new Error('user not found.'))
    else if (!('group' in workOptions)) reject(new Error('group not found.'))
    else {
      const request = `{"function":"addUserGroup","username":"${workOptions.username}","group":"${workOptions.group}","token":"${token}"}`
      await control.request(JSON.parse(request)).catch((e) => reject(e))
    }
    resolve(true)
  }))
}

/**
 *Queries the corelink relay to remove user from group(login user should either admin/ owner)
 *@param {String} User  name that you would like to user to group
 *@param {String} group  Groupname that will have a new user
 *@module rmUserGroup
 */

async function rmUserGroup(options) {
  return (new Promise(async (resolve, reject) => {
    const workOptions = options
    // checking inputs
    if (!('username' in workOptions)) reject(new Error('user not found.'))
    else if (!('group' in workOptions)) reject(new Error('group not found.'))
    else {
      const request = `{"function":"rmUserGroup","user":"${workOptions.username}","group":"${workOptions.group}","token":"${token}"}`
      await control.request(JSON.parse(request)).catch((e) => reject(e))
    }
    resolve(true)
  }))
}

/**
 *Queries the corelink relay for available group
 *@returns {Array} Array of group, empty array if no grou[] are available
 *@exports listGroups
 *@module listGroups
 */
async function listGroups() {
  return (new Promise(async (resolve, reject) => {
    const request = `{"function":"listGroups","token":"${token}"}`
    const content = await control.request(JSON.parse(request)).catch((e) => reject(e))
    if ('groupList' in content) resolve(content.groupList)
    else reject(new Error('  groupList not found.'))
  }))
}


/**
 *Queries the corelink relay to add a Group
 *@param {String} Group Group name that you would like to add
 *@param {String} owner owner name of the new group
 *@exports addGroup
 *@module addGroup
 */
async function addGroup(options) {
  return (new Promise(async (resolve, reject) => {
    const workOptions = options
    if (!('group' in workOptions)) {
      reject(new Error('new groupname not found.'))
      return
    }
    const request = `{"function":"addGroup","group":"${workOptions.group}","token":"${token}"}`
    await control.request(JSON.parse(request)).catch((e) => reject(e))
    resolve(true)
  }))
}


/**
 *Queries the corelink relay to remove a group
 *@param {String} Group group name that you would like to remove
 *@exports rmGroup
 *@module rmGroup
 */
async function rmGroup(options) {
  return (new Promise(async (resolve, reject) => {
    const workOptions = options
    // checking inputs
    if (!('group' in workOptions)) {
      reject(new Error('remove group not found.'))
      return
    }
    const request = `{"function":"rmGroup","group":"${workOptions.group}","token":"${token}"}`
    await control.request(JSON.parse(request)).catch((e) => reject(e))
    resolve(true)
  }))
}

/**
 *Queries the corelink relay to change the ownerhip of group
 *@param {String} Group group name that you would like to change owner
  *@param {String} username user name that you would like to be owner
 *@exports changeOwner
 *@module changeOwner
 */
async function changeOwner(options) {
  return (new Promise(async (resolve, reject) => {
    const workOptions = options
    // checking inputs
    if (!('group' in workOptions)) {
      reject(new Error('groupname not found.'))
      return
    }
    if (!('username' in workOptions)) {
      reject(new Error('username not found.'))
      return
    }
    const request = `{"function":"changeOwner","group":"${workOptions.group}","username":"${workOptions.username}","token":"${token}"}`
    await control.request(JSON.parse(request)).catch((e) => reject(e))
    resolve(true)
  }))
}


// Workspace management functions:

/**
 *Queries the corelink relay for available workspaces
 *@returns {Array} Array of workspaces, empty array if no workspaces are available
 *@exports listWorkspaces
 *@module listWorkspaces
 */
async function listWorkspaces() {
  return (new Promise(async (resolve, reject) => {
    const request = `{"function":"listWorkspaces","token":"${token}"}`
    const content = await control.request(JSON.parse(request)).catch((e) => reject(e))
    if ('workspaceList' in content) resolve(content.workspaceList)
    else reject(new Error('workspaceList not found.'))
  }))
}


/**
 *Queries the corelink relay to add a workspace
 *@param {String} workspace workspace name that you would like to add
 *@exports addWorkspace
 *@module addWorkspace
 */
async function addWorkspace(workspace) {
  return (new Promise(async (resolve, reject) => {
    const request = `{"function":"addWorkspace","workspace":"${workspace}","token":"${token}"}`
    await control.request(JSON.parse(request)).catch((e) => reject(e))
    resolve(true)
  }))
}


/**
 *Queries the corelink relay to remove a workspaces
 *@param {String} workspace workspace name that you would like to remove
 *@exports rmWorkspace
 *@module rmWorkspace
 */
async function rmWorkspace(workspace) {
  return (new Promise(async (resolve, reject) => {
    const request = `{"function":"rmWorkspace","workspace":"${workspace}","token":"${token}"}`
    await control.request(JSON.parse(request)).catch((e) => reject(e))
    resolve(true)
  }))
}


/**
 *Queries the corelink relay to set a default workspace
 *@param {String} workspace workspace name that you would like to set as default
 *@exports setDefaultWorkspace
 *@module setDefaultWorkspace
 */
async function setDefaultWorkspace(workspace) {
  return (new Promise(async (resolve, reject) => {
    const request = `{"function":"setDefaultWorkspace","workspace":"${workspace}","token":"${token}"}`
    await control.request(JSON.parse(request)).catch((e) => reject(e))
    resolve(true)
  }))
}


/**
 *Queries the corelink relay to get the current default workspace
 *@returns {String} workspace name that is currently set as default
 *@exports getDefaultWorkspace
 *@module getDefaultWorkspace
 */
async function getDefaultWorkspace() {
  return (new Promise(async (resolve, reject) => {
    const request = `{"function":"getDefaultWorkspace","token":"${token}"}`
    const content = await control.request(JSON.parse(request)).catch((e) => reject(e))
    if ('workspace' in content) resolve(content.workspace)
    else reject(new Error('No default workspace found.'))
  }))
}

// introspect functions functions

/**
 *Queries the corelink relay for available functions
 *@returns {Array} Array of functions that the server has available
 *@exports listFunctions
 *@module listFunctions
 */

async function listFunctions() {
  return (new Promise(async (resolve, reject) => {
    const request = {}
    request.function = 'listFunctions'
    request.token = token
    const content = await control.request(request).catch((e) => reject(e))
    if ('functionList' in content) resolve(content)
    else reject(new Error('functionList not found.'))
  }))
}

/**
 *Queries the corelink relay for available functions
 *@returns {object} the object has functionList which is an array of functions names that the
                    server has available
 *@exports listServerFunctions
 *@module listServerFunctions
 */

async function listServerFunctions() {
  return (new Promise(async (resolve, reject) => {
    const request = {}
    request.function = 'listServerFunctions'
    request.token = token
    const content = await control.request(request).catch((e) => reject(e))
    if ('functionList' in content) resolve(content)
    else reject(new Error('functionList not found.'))
  }))
}

/**
 *Queries a specific function to get its self descriptor
 *@param {String} options Options object, it has to have a function name
 *@returns {Object} JSON object that describes the function
 *@exports describeFunction
 *@module describeFunction
 */

async function describeFunction(options) {
  return (new Promise(async (resolve, reject) => {
    // checking inputs
    if (typeof options !== 'object') reject(new Error('No object supplied.'))
    if (!('functionName' in options)) reject(new Error('No function name found.'))

    const request = {}
    request.function = 'describeFunction'
    request.functionName = options.functionName
    request.token = token
    const content = await control.request(request).catch((e) => reject(e))
    if ('description' in content) resolve(content)
    else reject(new Error('description not found.'))
  }))
}

/**
 *Queries a specific function to get its self descriptor
 *@param {String} options Options object, it has to have a server function name
 *@returns {Object} JSON object that describes the function
 *@exports describeServerFunction
 *@module describeServerFunction
 */

async function describeServerFunction(options) {
  return (new Promise(async (resolve, reject) => {
    // checking inputs
    if (!('functionName' in options)) reject(new Error('No function name found.'))

    const request = {}
    request.function = 'describeServerFunction'
    request.functionName = options.functionName
    request.token = token
    const content = await control.request(request).catch((e) => reject(e))
    if ('description' in content) resolve(content)
    else reject(new Error('description not found.'))
  }))
}

/**
 *Get the receiverID of the current active receiver
 *@returns {String} receiverID Receiver streamID to remove streams from
 *@module getReceiverID
 */

async function getReceiverID() {
  return receiverStream.streamID
}

/**
 *Queries the corelink relay for available functions
 *@param {array} workspaces an array of workspaces to list streams, omitted or empty array
                            will list all workspaces that a user has access to
 *@param {array} types an array of types of streams to list
 *@returns {object} with senderStreams and receiverStreams arrays
 *@exports listStreams
 *@module listStreams
 */

async function listStreams(options) {
  return (new Promise(async (resolve, reject) => {
    const request = options || {}
    request.function = 'listStreams'
    request.token = token
    if (!('workspaces' in request)) request.workspaces = []
    if (!('types' in request)) request.types = []
    const content = await control.request(request).catch((e) => reject(e))
    resolve(content)
  }))
}

/**
*In the request made, subscribe function from Corelink protocol is called which
*gets the value of streamID and token. Further,the streamList array is checked
*to see if it has target streamList.
*@param {String} options objet. Allows a user to select streams to subscribe to.
    The options object should hold and array of streamIDs. If streamIDs or options
    is not given, all streams are sent
*@module subscribe
*/

async function subscribe(options) {
  return (new Promise(async (resolve, reject) => {
    let workOptions
    if (typeof options === 'undefined') workOptions = {}
    else workOptions = options

    if (!('streamIDs' in workOptions)) workOptions.streamIDs = []

    const request = `{"function":"subscribe","receiverID":"${receiverStream.streamID}","streamIDs":${JSON.stringify(workOptions.streamIDs)},"token":"${token}"}`
    if (debug) console.log('subscribe request', request)
    const content = await control.request(JSON.parse(request)).catch((e) => reject(e))
    if (debug) console.log('subscribe json', content)

    if ('streamList' in content) receiverStream.streamList = content.streamList
    else reject(new Error('Target streamList not found.'))

    for (const stream in content.streamList) {
      if (!allowedStreams.includes(content.streamList[stream].streamID)) {
        allowedStreams.push(content.streamList[stream].streamID)
      }
    }
    if (debug) console.log('subscribe streamList', content.streamList)
    resolve(content.streamList)
  }))
}


/**
*In the request made, subscribe function from Corelink protocol is called which
*gets the value of streamID and token. Further,the streamList array is checked
*to see if it has target streamList. The function expects an object with the
*following parameters:
*@param {array} streamIDs Allows a user to select streams to unsubscribe from.
                          If streamIDs are not given or empty all are unsubscribed from
*@module unsubscribe
*/

async function unsubscribe(options) {
  return (new Promise(async (resolve, reject) => {
    let workOptions
    if (typeof options === 'undefined') workOptions = {}
    else workOptions = options

    if (!('streamIDs' in workOptions)) workOptions.streamIDs = []

    const request = `{"function":"unsubscribe","receiverID":${receiverStream.streamID},"streamIDs":${JSON.stringify(workOptions.streamIDs)},"token":"${token}"}`
    if (debug) console.log('unsubscribe request', request)
    const content = await control.request(JSON.parse(request)).catch((e) => reject(e))
    if (debug) console.log('unsubscribe json', content)

    for (let i = 0; i < allowedStreams.length; i += 1) {
      if (content.streamList.includes(allowedStreams[i])) delete allowedStreams[i]
    }
    resolve(content.streamList)
  }))
}


/**
*Function to register event handlers for specific events
*@param {array} type type of event:
  - receiver: calls back with new streams that are available
  - sender: calls back with new streams that are subscribed
  - stale: call back with streams that went stale for this receiver and can be unsubscribed
  - dropped: calls back with streams that dropped the subscription for a sender
  - close: the control connection was closed
  - data: calls back when data has arrived with (streamID, data, header)
*@param {array} cb a function with the corresponding callback
*@module on
*/

const on = (async function on(type, cb) {
  switch (type) {
    case 'receiver':
      receiverCb = cb
      break
    case 'sender':
      senderCb = cb
      break
    case 'data':
      dataCb = cb
      break
    case 'stale':
      staleCb = cb
      break
    case 'dropped':
      droppedCb = cb
      break
    case 'close':
      closeCb = cb
      break
    default:
      break
  }
})


/**
 *Queries server functions that dont need special parameters
  *@param {object} options Options object,
          if generic is called the function name and the parameters need to be in a JSON object according to
          https://corelink.hpc.nyu.edu/documentation/server-documentation/client-initiated-control-functions
 *@returns {Object} JSON object that contains the function result
 *@exports generic
 *@module generic
 */

async function generic(options) {
  return (new Promise(async (resolve, reject) => {
    // checking inputs
    const workOptions = options
    if (typeof workOptions !== 'object') reject(new Error('No object supplied.'))
    if (!('function' in workOptions)) reject(new Error('No function name'))

    // adding token to request
    if (!workOptions.token) workOptions.token = token
    if (debug) console.log(workOptions)
    const content = await control.request(workOptions).catch((e) => reject(e))
    if (content) resolve(content)
    else reject(new Error('Wrong Expresions.'))
  }))
}


/**
 *Requests a disconnect streams
 *@param {String} workspaces Workspaces are used to separate out groups of
  streams so that several independent groups of researchers can work together.
 *@param {String} types disconnect only streams of a particular type.
 *@param {String} streamIDs Allows a user to select streams to Subscribe to. If
  StreamID is not given, all streams are sent, the streamIDs have to be numbers
 *@returns {object} in the object there will be the array streamList
 *@module disconnect
*/

async function disconnect(options) {
  return (new Promise(async (resolve, reject) => {
    console.log('options', options)
    const request = {}
    request.types = []
    request.workspaces = []
    request.streamIDs = []

    if (typeof options === 'object') {
      if (('types' in options) && Array.isArray(options.types) && (options.types.length > 0)) request.types = request.types.concat(options.types)
      if (('types' in options) && (typeof options.types === 'string')) request.types.push(options.types)
      if (('workspaces' in options) && Array.isArray(options.workspaces) && (options.workspaces.length > 0)) request.workspaces = request.workspaces.concat(options.workspaces)
      if (('workspaces' in options) && (typeof options.workspaces === 'string')) request.workspaces.push(options.workspaces)
      if (('streamIDs' in options) && Array.isArray(options.streamIDs) && (options.streamIDs.length > 0)) request.streamIDs = request.streamIDs.concat(options.streamIDs)
      if (('streamIDs' in options) && (typeof options.streamIDs === 'number')) request.streamIDs.push(options.streamIDs)
    }
    request.function = 'disconnect'
    request.token = token

    if (debug) console.log('disconnect request', request)
    const content = await control.request(request).catch((e) => reject(e))
    if (debug) console.log('disconnect content', content)
    resolve(content)
  }))
}

/**
 *This module gets all local streamIDs and,checks if they are undefined and
  pushes them. The connection then waits for a disconnect to occur.
 *@param {String} resolve If all streamIDs are fetched successfully for a
  successful disconnect
 *@param {String} reject If all streamIDs are not fetched, an error message is displayed
 *@module exit
*/
async function exit() {
  console.log('Trying to exit.')
  return (new Promise((async (resolve, reject) => {
    // get all local streamID's
    const streamIDs = []
    if (typeof receiverStream.streamID !== 'undefined') streamIDs.push(receiverStream.streamID)
    for (const streamID in senderStreams) if (streamID) streamIDs.push(parseInt(streamID, 10))
    if (debug) console.log('Exit: Disconnect Request.')
    const dis = await disconnect({ streamIDs }).catch((err) => reject(err))
    if (dis === true) resolve(true)
    else reject(dis)
  })))
}

// End Common Functions

process.on('SIGINT', async () => {
  console.log('Termination request received.')
  setTimeout(process.exit, 2000)
  await exit().catch(process.exit)
  process.exit()
})

// expose property debug, so programs can switch debug on if needed
module.exports.debug = debug

module.exports.on = on
module.exports.connect = connect

module.exports.setDebug = setDebug

module.exports.generic = generic
module.exports.addWorkspace = addWorkspace
module.exports.rmWorkspace = rmWorkspace
module.exports.setDefaultWorkspace = setDefaultWorkspace
module.exports.getDefaultWorkspace = getDefaultWorkspace
module.exports.listWorkspaces = listWorkspaces
module.exports.listFunctions = listFunctions
module.exports.listServerFunctions = listServerFunctions
module.exports.describeFunction = describeFunction
module.exports.describeServerFunction = describeServerFunction
module.exports.createSender = createSender
module.exports.send = send
module.exports.subscribe = subscribe
module.exports.unsubscribe = unsubscribe
module.exports.disconnect = disconnect
module.exports.createReceiver = createReceiver
module.exports.getReceiverID = getReceiverID
module.exports.exit = exit
module.exports.login = login
module.exports.setConfig = setConfig
module.exports.listStreams = listStreams


// user funtions:
module.exports.listUsers = listUsers
module.exports.rmUser = rmUser
module.exports.addUser = addUser
module.exports.password = password

// group functions:
module.exports.listGroups = listGroups
module.exports.rmGroup = rmGroup
module.exports.addGroup = addGroup
module.exports.addUserGroup = addUserGroup
module.exports.rmUserGroup = rmUserGroup
module.exports.changeOwner = changeOwner
