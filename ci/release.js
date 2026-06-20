/**
 * 一键发版（带交互确认）
 *
 * 流程:
 *   1. 跑单元测试（必须全过）
 *   2. 跑 E2E（必须全过）
 *   3. 弹出确认提示，输入 Y/yes 才上传体验版；其他任何输入都中止
 *
 * 用法: npm run release
 */

const { spawnSync } = require('child_process')
const readline = require('readline')

function run(label, cmd, args) {
  console.log(`\n========== ${label} ==========`)
  const r = spawnSync(cmd, args, { stdio: 'inherit', shell: true })
  if (r.status !== 0) {
    console.error(`\n[release] ${label} 失败，已中止。请修好再试。`)
    process.exit(r.status || 1)
  }
}

function ask(question) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
    rl.question(question, (ans) => {
      rl.close()
      resolve(ans.trim().toLowerCase())
    })
  })
}

;(async () => {
  // 1. 单元测试
  run('1/3 单元测试', 'npm', ['run', 'test:unit'])

  // 2. E2E（注意：需要先开微信开发者工具 + 自动化端口）
  run('2/3 E2E 测试', 'npm', ['run', 'test:e2e'])

  // 3. 交互确认
  console.log('\n========== 3/3 上传体验版 ==========')
  console.log('测试全部通过 ✅')
  const ans = await ask('确认上传体验版到微信公众平台？输入 Y 继续，其他任意键中止: ')
  if (ans !== 'y' && ans !== 'yes') {
    console.log('[release] 已中止上传，本次不发版。')
    process.exit(0)
  }

  // 可选：让用户输入版本号和描述
  const version = await ask('版本号（回车跳过、用默认 package.json 版本）: ')
  const desc = await ask('本次更新描述（回车跳过）: ')

  const args = ['ci/index.js', 'upload']
  if (version) args.push(version)
  if (desc) args.push(desc)
  run('上传中', 'node', args)

  console.log('\n[release] ✅ 完成！去公众平台「版本管理」可见体验版。')
})()
