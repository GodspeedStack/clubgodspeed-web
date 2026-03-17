const http = require('http');
const fs = require('fs');

const SITE_URL = 'http://localhost:8000';
const visited = new Set();
const brokenLinks = new Set();

async function checkLink(url, sourceUrl) {
    if (visited.has(url)) return;
    visited.add(url);
    
    // Skip external links for now, just verify local routing
    if (!url.startsWith(SITE_URL) && url.startsWith('http')) return;
    
    let fetchUrl = url.startsWith('http') ? url : SITE_URL + (url.startsWith('/') ? url : '/' + url);
    // Ignore mailto/tel
    if (fetchUrl.startsWith('mailto:') || fetchUrl.startsWith('tel:')) return;
    
    try {
        const res = await fetch(fetchUrl);
        if (!res.ok) {
            brokenLinks.add({ url: fetchUrl, source: sourceUrl, status: res.status });
        } else {
            // If it's HTML, parse it for more links
            const contentType = res.headers.get('content-type');
            if (contentType && contentType.includes('text/html')) {
                const text = await res.text();
                const matches = text.match(/href="([^"]+)"/g);
                if (matches) {
                    for (const match of matches) {
                        const newUrl = match.replace('href="', '').replace('"', '');
                        if (newUrl !== '#' && !newUrl.startsWith('javascript:')) {
                            await checkLink(newUrl, fetchUrl);
                        }
                    }
                }
            }
        }
    } catch (e) {
        brokenLinks.add({ url: fetchUrl, source: sourceUrl, error: e.message });
    }
}

async function run() {
    console.log("Starting crawler on", SITE_URL);
    await checkLink(SITE_URL + '/', 'Root');
    console.log("\n==== BROKEN LINKS FOUND ====");
    if (brokenLinks.size === 0) {
        console.log("None! All scanned internal links returned 200 OK.");
    } else {
        brokenLinks.forEach(link => {
            console.log(`[${link.status || 'ERROR'}] ${link.url} (found on ${link.source})`);
        });
    }
}

run();
