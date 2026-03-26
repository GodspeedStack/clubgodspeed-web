const puppeteer = require('puppeteer');
const fs = require('fs');

async function generatePDF() {
    const parentName = 'Anton Parent (LeBron James Jr.)';
    const email = 'anton@example.com';
    const date = new Date().toLocaleDateString();

    const record = {
        hours: {
            totalPurchased: 24,
            used: 18.5,
            remaining: 5.5
        },
        purchases: [
            { date: '2026-01-15', item: 'Winter Training Package (12 hrs)', status: 'paid', amount: '$450.00' },
            { date: '2026-03-01', item: 'Spring Pre-Season Package (12 hrs)', status: 'paid', amount: '$450.00' }
        ],
        usage: [
            { date: '2026-03-25', session: 'Defensive Rotations Focus (Team Practice)', duration: '1.5 hrs', coach: 'Coach Blyakhman' },
            { date: '2026-03-20', session: 'Transition Offense & Guard Reads', duration: '1.5 hrs', coach: 'Coach Blyakhman' },
            { date: '2026-03-18', session: 'Shooting Mechanics & Reps', duration: '1.0 hrs', coach: 'Coach Blyakhman' },
            { date: '2026-03-13', session: 'Pick & Roll Read Progression', duration: '1.5 hrs', coach: 'Coach Blyakhman' },
            { date: '2026-03-10', session: 'Full Court Scrimmage Evaluation', duration: '2.0 hrs', coach: 'Coach Blyakhman' }
        ]
    };

    const htmlContent = `
        <html>
        <head>
            <title>Training Statement - Godspeed</title>
            <style>
                body { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; color: #333; line-height: 1.5; padding: 40px; margin: 0; }
                .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 40px; border-bottom: 2px solid #000; padding-bottom: 20px; }
                .logo { font-size: 24px; font-weight: 900; letter-spacing: -1px; text-transform: uppercase; float: left; }
                .logo span { color: #0071e3; }
                .invoice-details { text-align: right; float: right; }
                .invoice-details h1 { margin: 0; font-size: 20px; text-transform: uppercase; color: #555; }
                .invoice-details p { margin: 5px 0 0; font-size: 14px; color: #777; }
                
                .clear { clear: both; }

                .section-title { font-size: 14px; font-weight: 700; text-transform: uppercase; color: #555; margin: 30px 0 10px; border-bottom: 1px solid #eee; padding-bottom: 5px; }
                
                .summary-grid { display: block; width: 100%; margin-bottom: 30px; overflow: hidden; }
                .stat-box { float: left; width: 31%; background: #f9fafb; padding: 15px 0; border-radius: 8px; border: 1px solid #eee; text-align: center; margin-right: 2%; box-sizing: border-box; }
                .stat-box:last-child { margin-right: 0; }
                .stat-val { font-size: 24px; font-weight: 700; color: #111; display: block; margin-bottom: 5px; }
                .stat-label { font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; color: #666; font-weight: 600; }

                table { width: 100%; border-collapse: collapse; font-size: 13px; margin-bottom: 30px; }
                th { text-align: left; background: #f3f4f6; padding: 10px; font-weight: 600; text-transform: uppercase; font-size: 11px; color: #555; }
                td { padding: 12px 10px; border-bottom: 1px solid #eee; }
                tr:last-child td { border-bottom: none; }
                
                .amount { font-weight: 700; color: #111; }
                
                .footer { margin-top: 60px; padding-top: 20px; border-top: 1px solid #eee; font-size: 12px; color: #888; text-align: center; }
            </style>
        </head>
        <body>
            <div class="header">
                <div class="logo">GODSPEED<span style="color: #0071e3;">BASKETBALL</span></div>
                <div class="invoice-details">
                    <h1>Training Statement</h1>
                    <p>Date: ${date}</p>
                    <p>Account: ${parentName}</p>
                    <p>Email: ${email}</p>
                </div>
                <div class="clear"></div>
            </div>

            <div class="section-title">Hours Summary</div>
            <div class="summary-grid">
                <div class="stat-box">
                    <span class="stat-val">${record.hours.totalPurchased}</span>
                    <span class="stat-label">Active Purchased</span>
                </div>
                <div class="stat-box">
                    <span class="stat-val">${record.hours.used.toFixed(1)}</span>
                    <span class="stat-label">Active Used</span>
                </div>
                <div class="stat-box">
                    <span class="stat-val" style="color: #0071e3;">${record.hours.remaining.toFixed(1)}</span>
                    <span class="stat-label">Hours Remaining</span>
                </div>
                <div class="clear"></div>
            </div>

            <div class="section-title">Purchase History</div>
            <table>
                <thead>
                    <tr>
                        <th>Date</th>
                        <th>Item</th>
                        <th>Status</th>
                        <th style="text-align:right;">Amount</th>
                    </tr>
                </thead>
                <tbody>
                    ${record.purchases.map(p => `
                        <tr>
                            <td>${p.date}</td>
                            <td>${p.item}</td>
                            <td><span style="background:#dcfce7; color:#166534; padding:3px 8px; border-radius:4px; font-size:10px; font-weight:700;">${p.status.toUpperCase()}</span></td>
                            <td style="text-align:right;" class="amount">${p.amount}</td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>

            <div class="section-title">Usage Log</div>
            <table>
                <thead>
                    <tr>
                        <th>Date</th>
                        <th>Session</th>
                        <th>Duration</th>
                        <th>Coach</th>
                    </tr>
                </thead>
                <tbody>
                    ${record.usage.map(u => `
                        <tr>
                            <td>${u.date}</td>
                            <td style="font-weight: 500; color: #111;">${u.session}</td>
                            <td>${u.duration}</td>
                            <td style="color: #666;">${u.coach}</td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>

            <div class="footer">
                This is an automated statement generated by the Godspeed parent portal.<br>
                For billing inquiries, please contact info@clubgodspeed.com
            </div>
        </body>
        </html>
    `;

    console.log('Launching browser...');
    const browser = await puppeteer.launch({ headless: 'new' });
    const page = await browser.newPage();
    
    console.log('Setting HTML content...');
    await page.setContent(htmlContent, { waitUntil: 'networkidle0' });
    
    console.log('Generating PDF...');
    await page.pdf({ 
        path: 'Anton_Training_Statement.pdf', 
        format: 'Letter',
        printBackground: true,
        margin: { top: '0.5in', bottom: '0.5in', left: '0.5in', right: '0.5in' }
    });

    await browser.close();
    console.log('Done! Saved Anton_Training_Statement.pdf');
}

generatePDF().catch(console.error);
