const automator = require('miniprogram-automator')
const { spawn } = require('child_process')
const path = require('path')
const net = require('net')

// Patch checkVersion — newer DevTools return undefined SDKVersion
const MiniProgram = require('miniprogram-automator/out/MiniProgram').default
MiniProgram.prototype.checkVersion = async function () {}

let miniProgram = null

const PROJECT_PATH = path.resolve(__dirname, '../../')
const AUTO_PORT = 9420

function getCliPath() {
  if (process.platform === 'win32') {
    return 'C:/Program Files (x86)/Tencent/微信web开发者工具/cli.bat'
  }
  if (process.platform === 'darwin') {
    return '/Applications/wechatwebdevtools.app/Contents/MacOS/cli'
  }
  return '/opt/wechatwebtools/cli'
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

function startAutoSession() {
  const cliPath = getCliPath()

  if (process.platform === 'win32') {
    // Use detached, shell mode for .bat on Windows
    const proc = spawn('cmd.exe', [
      '/c', `"${cliPath}" auto --project "${PROJECT_PATH}" --auto-port ${AUTO_PORT} --trust-project`,
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
      '--auto-port', String(AUTO_PORT),
      '--trust-project',
    ], { stdio: 'ignore', detached: true })
    proc.unref()
  }
}

async function launchApp() {
  if (miniProgram) return miniProgram

  // If port already open from a prior auto session, connect directly
  if (await isPortOpen(AUTO_PORT)) {
    miniProgram = await automator.connect({
      wsEndpoint: `ws://127.0.0.1:${AUTO_PORT}`,
    })
    return miniProgram
  }

  // Start auto session
  startAutoSession()

  const portReady = await waitForPort(AUTO_PORT, 30000)
  if (!portReady) {
    throw new Error(
      `Automation port ${AUTO_PORT} did not open within 30s. ` +
      'Ensure WeChat DevTools is running with service port enabled.'
    )
  }

  // Small delay to let WS server fully initialize
  await new Promise(r => setTimeout(r, 1000))

  miniProgram = await automator.connect({
    wsEndpoint: `ws://127.0.0.1:${AUTO_PORT}`,
  })

  return miniProgram
}

async function closeApp() {
  // Only null the reference — do NOT call miniProgram.close()
  // as it kills the WS server and prevents session reuse.
  miniProgram = null
}

function getApp() {
  return miniProgram
}

module.exports = { launchApp, closeApp, getApp, AUTO_PORT }
