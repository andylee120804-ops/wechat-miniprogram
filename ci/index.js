/**
 * 微信小程序 CI 脚本
 *
 * 用法（在项目根目录）：
 *   node ci/index.js upload        # 上传体验版（自动读取 package.json 的 version）
 *   node ci/index.js upload 1.2.3 "修复打卡bug"
 *   node ci/index.js preview       # 生成预览二维码（ci/preview.jpg）
 *   node ci/index.js sourcemap     # 下载已上传版本的 sourcemap 到 ci/dist/sourcemap.zip
 *   node ci/index.js package       # 打 npm 构建产物（执行 buildNpm）
 *   node ci/index.js check         # 代码质量分析（包大小/依赖/代码警告）
 *   node ci/index.js cloud-upload  # 上传云函数（指定 --name=xxx）
 *
 * 文档参考: https://developers.weixin.qq.com/miniprogram/dev/devtools/ci.html
 */

const path = require('path')
const fs = require('fs')
const ci = require('miniprogram-ci')

const APPID = 'wx0937941245b3c0be'
const PROJECT_ROOT = path.resolve(__dirname, '..')
const PRIVATE_KEY_PATH = path.join(__dirname, 'keys', `private.${APPID}.key`)
const DIST_DIR = path.join(__dirname, 'dist')

if (!fs.existsSync(PRIVATE_KEY_PATH)) {
  console.error(`[CI] 找不到密钥文件: ${PRIVATE_KEY_PATH}`)
  console.error('     请到微信公众平台 → 开发管理 → 开发设置 → 小程序代码上传 下载密钥并放在此处')
  process.exit(1)
}

if (!fs.existsSync(DIST_DIR)) fs.mkdirSync(DIST_DIR, { recursive: true })

// 复用同一个 Project 实例
const project = new ci.Project({
  appid: APPID,
  type: 'miniProgram',
  projectPath: PROJECT_ROOT,
  privateKeyPath: PRIVATE_KEY_PATH,
  ignores: ['node_modules/**/*', 'tests/**/*', 'minitest/**/*', 'ci/**/*', 'docs/**/*'],
})

// 上传/预览统一编译选项（与开发者工具一致）
const COMPILE_SETTINGS = {
  es6: true,
  es7: true,
  minify: true,
  codeProtect: false,
  minifyJS: true,
  minifyWXML: true,
  minifyWXSS: true,
  autoPrefixWXSS: true,
}

function readPkgVersion() {
  try {
    const pkg = require(path.join(PROJECT_ROOT, 'miniprogram', 'package.json'))
    if (pkg && pkg.version) return pkg.version
  } catch (_) {}
  const root = require(path.join(PROJECT_ROOT, 'package.json'))
  return root.version || '1.0.0'
}

async function cmdUpload(version, desc) {
  const v = version || readPkgVersion()
  const d = desc || `CI 上传 ${new Date().toISOString().slice(0, 19)}`
  console.log(`[CI] 上传体验版 v${v} — ${d}`)
  const result = await ci.upload({
    project,
    version: v,
    desc: d,
    setting: COMPILE_SETTINGS,
    robot: 1, // 1-30，CI 机器人编号，不同流水线建议用不同 robot 防止覆盖
    onProgressUpdate: (info) => {
      if (typeof info === 'string') process.stdout.write('.')
    },
  })
  console.log('\n[CI] 上传完成:')
  console.log(`     总包大小: ${(result.subPackageInfo[0]?.size / 1024).toFixed(2)} KB`)
  console.log('     去公众平台 → 版本管理 → 开发版 中将体验版设为正式版')
}

async function cmdPreview() {
  const qrPath = path.join(__dirname, 'preview.jpg')
  console.log('[CI] 生成预览二维码 → ' + qrPath)
  const result = await ci.preview({
    project,
    desc: `预览 ${new Date().toISOString().slice(0, 19)}`,
    setting: COMPILE_SETTINGS,
    qrcodeFormat: 'image',
    qrcodeOutputDest: qrPath,
    robot: 2,
    onProgressUpdate: () => process.stdout.write('.'),
  })
  console.log('\n[CI] 预览成功，扫描 ci/preview.jpg 即可在手机微信打开')
  console.log(`     体积: ${(result.subPackageInfo[0]?.size / 1024).toFixed(2)} KB`)
}

async function cmdSourcemap(version, robot = 1) {
  const v = version || readPkgVersion()
  const dst = path.join(DIST_DIR, `sourcemap-${v}.zip`)
  console.log(`[CI] 下载 sourcemap v${v} robot=${robot} → ${dst}`)
  await ci.getDevSourceMap({
    appid: APPID,
    privateKeyPath: PRIVATE_KEY_PATH,
    robot: Number(robot),
    sourceMapSavePath: dst,
  })
  console.log('[CI] sourcemap 下载完成（用于线上报错堆栈还原）')
}

async function cmdPackageNpm() {
  console.log('[CI] 构建 npm（等价于开发者工具的「构建 npm」）')
  const warnings = await ci.packNpm(project, {
    ignores: ['pack_npm_ignore_list'],
    reporter: (infos) => console.log(infos),
  })
  console.log(`[CI] 完成，警告 ${warnings.length} 条`)
}

async function cmdCheck() {
  console.log('[CI] 代码质量分析（包大小、依赖、警告）')
  const cqr = await ci.getProjectCheck({
    project,
  }).catch((e) => {
    console.warn('[CI] getProjectCheck 不可用，可能是版本/网络问题：', e.message)
    return null
  })
  if (cqr) console.log(JSON.stringify(cqr, null, 2))

  // 体积分析（dry-run 上传）：robot=30 专用做体积分析，不会真正发布
  console.log('\n[CI] 跑一次 dry-run 上传以获取分包体积...')
  try {
    const r = await ci.upload({
      project,
      version: readPkgVersion(),
      desc: 'CI dry-run',
      setting: COMPILE_SETTINGS,
      robot: 30,
    })
    console.log('[CI] 分包体积:')
    ;(r.subPackageInfo || []).forEach((p) => {
      console.log(`     ${p.name || 'main'}: ${(p.size / 1024).toFixed(2)} KB`)
    })
  } catch (e) {
    console.warn('[CI] dry-run 失败:', e.message)
  }
}

async function cmdCloudUpload(name) {
  if (!name) {
    console.error('[CI] 用法: node ci/index.js cloud-upload <云函数名>')
    process.exit(1)
  }
  const env = 'cloud1-d9gwvttcr864f8021'
  console.log(`[CI] 上传云函数 ${name} → 环境 ${env}`)
  await ci.cloud.uploadFunctions({
    project,
    env,
    names: [name],
    functionRoot: path.join(PROJECT_ROOT, 'cloudfunctions'),
    remoteNpmInstall: true,
  })
  console.log('[CI] 云函数上传完成')
}

;(async () => {
  const [, , cmd, ...rest] = process.argv
  try {
    switch (cmd) {
      case 'upload':    return await cmdUpload(rest[0], rest.slice(1).join(' '))
      case 'preview':   return await cmdPreview()
      case 'sourcemap': return await cmdSourcemap(rest[0], rest[1])
      case 'package':   return await cmdPackageNpm()
      case 'check':     return await cmdCheck()
      case 'cloud-upload': return await cmdCloudUpload(rest[0])
      default:
        console.log('用法:')
        console.log('  node ci/index.js upload [version] [desc]')
        console.log('  node ci/index.js preview')
        console.log('  node ci/index.js sourcemap [version] [robot]')
        console.log('  node ci/index.js package')
        console.log('  node ci/index.js check')
        console.log('  node ci/index.js cloud-upload <name>')
    }
  } catch (e) {
    console.error('\n[CI] 失败:', e.message || e)
    process.exit(1)
  }
})()
