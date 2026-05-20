const automator = require('miniprogram-automator')
const { spawn } = require('child_process')
const path = require('path')
const net = require('net')

// Patch checkVersion — newer DevTools return undefined SDKVersion
const MiniProgram = require('miniprogram-automator/out/MiniProgram').default
MiniProgram.prototype.checkVersion = async function () {}

let miniProgram = null
let autoSessionStarted = false

const PROJECT_PATH = path.resolve(__dirname, '../../')
const AUTO_PORT = process.env.AUTO_PORT || 33864

function getCliPath() {
  if (process.platform === 'win32') {
    return 'C:/Program Files (x86)/Tencent/微信web开发者工具/cli.bat'
  }
  return '/Applications/wechatwebdevtools.app/Contents/MacOS/cli'
}

function isPortOpen(port) {
  return new Promise((resolve) => {
    const sock = net.createConnection(port, '127.0.0.1')
    sock.on('connect', () => { sock.destroy(); resolve(true) })
    sock.on('error', () => resolve(false))
    sock.setTimeout(1500, () => { sock.destroy(); resolve(false) })
  })
}

async function waitForPort(port, timeout = 30000) {
  const start = Date.now()
  while (Date.now() - start < timeout) {
    if (await isPortOpen(port)) return true
    await new Promise(r => setTimeout(r, 1500))
  }
  return false
}

async function findIdePort() {
  // Check preferred port first
  if (await isPortOpen(AUTO_PORT)) return AUTO_PORT

  // Scan common alternative ports the IDE might use
  const http = require('http')
  const altPorts = [33865, 33866, 15386, 34456, 41116, 44964, 50908]
  for (const p of altPorts) {
    if (await isPortOpen(p)) {
      try {
        const code = await new Promise((resolve) => {
          http.get(`http://127.0.0.1:${p}/v2/open?project=${PROJECT_PATH.replace(/\\/g, '/')}`, (res) => {
            resolve(res.statusCode)
          }).on('error', () => resolve(0))
        })
        if (code === 200) return p
      } catch (e) {}
    }
  }
  return null
}

function startAutoSession(port) {
  if (autoSessionStarted) return
  autoSessionStarted = true

  const cliPath = getCliPath()
  if (process.platform === 'win32') {
    const proc = spawn('cmd.exe', [
      '/c', `"${cliPath}" auto --project "${PROJECT_PATH}" --auto-port ${port} --trust-project`,
    ], {
      stdio: 'ignore',
      shell: true,
      detached: true,
      windowsHide: true,
    })
    proc.unref()
  } else {
    const proc = spawn(cliPath, [
      'auto', '--project', PROJECT_PATH,
      '--auto-port', String(port),
      '--trust-project',
    ], { stdio: 'ignore', detached: true })
    proc.unref()
  }
}

async function tryConnect(port, retries) {
  for (let i = 0; i < retries; i++) {
    try {
      const mp = await automator.connect({
        wsEndpoint: `ws://127.0.0.1:${port}`,
      })
      return mp
    } catch (e) {
      if (i < retries - 1) {
        await new Promise(r => setTimeout(r, 2000))
      }
    }
  }
  return null
}

async function launchApp() {
  // Reuse existing connection if still alive
  if (miniProgram) {
    try {
      await miniProgram.evaluate(function () { return true })
      return miniProgram
    } catch (e) {
      miniProgram = null
    }
  }

  // Step 1: Try connecting to an already-running IDE on the auto port
  if (await isPortOpen(AUTO_PORT)) {
    const mp = await tryConnect(AUTO_PORT, 3)
    if (mp) { miniProgram = mp; return mp }
  }

  // Step 2: Scan for IDE HTTP port and trigger auto mode via API
  const idePort = await findIdePort()
  if (idePort) {
    // Trigger auto mode through the IDE HTTP API
    const http = require('http')
    await new Promise((resolve) => {
      http.get(`http://127.0.0.1:${idePort}/v2/auto?project=${PROJECT_PATH.replace(/\\/g, '/')}`, () => resolve())
        .on('error', () => resolve())
    })
    await new Promise(r => setTimeout(r, 3000))

    // The auto WS server should now be on AUTO_PORT
    if (await isPortOpen(AUTO_PORT)) {
      const mp = await tryConnect(AUTO_PORT, 5)
      if (mp) { miniProgram = mp; return mp }
    }
  }

  // Step 3: Start a new auto session via CLI
  startAutoSession(AUTO_PORT)

  // Wait for the automation port to open
  const portReady = await waitForPort(AUTO_PORT, 60000)
  if (!portReady) {
    throw new Error(
      `Automation port ${AUTO_PORT} did not open within 60s. ` +
      'Ensure WeChat DevTools is running with service port enabled and you are logged in.'
    )
  }

  // Wait for WS endpoint to stabilize
  await new Promise(r => setTimeout(r, 5000))

  const mp = await tryConnect(AUTO_PORT, 5)
  if (mp) { miniProgram = mp; return mp }

  throw new Error(
    'Failed to connect to WeChat DevTools automation. ' +
    'Possible causes:\n' +
    '  1. DevTools requires login — open DevTools GUI and log in first\n' +
    '  2. Service port not enabled — Settings > Security > Service Port\n' +
    '  3. Project not open — open the project in DevTools before running tests'
  )
}

async function closeApp() {
  // Keep the miniProgram instance alive across test suites.
  // Only null the reference — do NOT call miniProgram.close()
  // as it kills the WS server and prevents session reuse.
}

function getApp() {
  return miniProgram
}

module.exports = { launchApp, closeApp, getApp, AUTO_PORT }
