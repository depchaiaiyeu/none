// bypassUAM.js
// Script này giúp vượt qua Cloudflare UAM (Under Attack Mode)
// Dependencies: axios, tough-cookie, axios-cookiejar-support

const axios = require('axios').default;
const { CookieJar } = require('tough-cookie');
const { wrapper } = require('axios-cookiejar-support');
const fs = require('fs');

const target = process.argv[2];
if (!target) {
    console.log("Usage: node bypassUAM.js <target_url>");
    process.exit(1);
}

(async () => {
    const jar = new CookieJar();
    const client = wrapper(axios.create({
        jar,
        withCredentials: true,
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.9',
            'Connection': 'keep-alive'
        }
    }));

    try {
        const res = await client.get(target);
        const cookies = await jar.getCookies(target);

        const cfClearance = cookies.find(c => c.key === 'cf_clearance');
        if (cfClearance) {
            console.log("[+] Bypass thành công!");
            console.log("cf_clearance:", cfClearance.value);
            fs.writeFileSync('cf_clearance.txt', cfClearance.value);
        } else {
            console.log("[-] Không tìm thấy cookie cf_clearance. Có thể thất bại.");
        }
    } catch (err) {
        console.error("[!] Request lỗi:", err.message);
    }
})();
