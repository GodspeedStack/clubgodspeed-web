const {
 Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
 AlignmentType, BorderStyle, WidthType, ShadingType, VerticalAlign
} = require('docx');
const fs = require('fs');
const path = require('path');

// ── PALETTE (matches v4 internal doc) ─────────────────────────────────────
const GS_BLACK = '0A0A0A';
const GS_DARK = '1A1A1A';
const GS_WHITE = 'FFFFFF';
const GS_OFFWHITE = 'F2F2F2';
const GS_GRAY = '666666';
const GS_BLUE = '1565C0';
const GS_BLUE_MID = '1976D2';
const GS_BLUE_LIGHT = 'BBDEFB';
const GS_BLUE_PALE = 'E3F2FD';
const GS_BLUE_DARK = '0D47A1';
const STATUS_GREEN = 'E8F5E9';
const STATUS_GREEN_T = '2E7D32';

const NO = { style: BorderStyle.NONE, size: 0, color: GS_WHITE };
const NOB = { top: NO, bottom: NO, left: NO, right: NO };
const BLUE_LINE = { style: BorderStyle.SINGLE, size: 2, color: GS_BLUE };
const THIN_LINE = { style: BorderStyle.SINGLE, size: 1, color: GS_BLUE_LIGHT };
const ROW_B = { top: THIN_LINE, bottom: THIN_LINE, left: NO, right: NO };
const BLUE_LEFT = { top: NO, bottom: NO, left: { style: BorderStyle.SINGLE, size: 16, color: GS_BLUE }, right: NO };
const GREEN_LEFT = { top: NO, bottom: NO, left: { style: BorderStyle.SINGLE, size: 16, color: STATUS_GREEN_T }, right: NO };

function sp(b = 0, a = 0) { return { spacing: { before: b, after: a } }; }
function r(text, opts = {}) {
 return new TextRun({ text, font: 'Calibri', size: opts.size || 20, bold: opts.bold || false, color: opts.color || GS_DARK, italics: opts.italics || false, allCaps: opts.caps || false });
}
function p(children, opts = {}) {
 return new Paragraph({ children: Array.isArray(children) ? children : [children], alignment: opts.align || AlignmentType.LEFT, ...sp(opts.before || 0, opts.after || 0), ...(opts.border ? { border: { bottom: BLUE_LINE } } : {}) });
}
function gap(pts = 100) { return p([r('')], { before: pts }); }

// Cover
function cover() {
 return new Table({
 width: { size: 9360, type: WidthType.DXA }, columnWidths: [9360],
 rows: [new TableRow({
 children: [new TableCell({
 borders: NOB,
 shading: { fill: GS_BLUE_DARK, type: ShadingType.CLEAR },
 margins: { top: 440, bottom: 440, left: 400, right: 400 },
 children: [
 p([r('CLUB ', { bold: true, size: 48, color: GS_WHITE }), r('GODSPEED', { bold: true, size: 48, color: GS_BLUE_LIGHT })], { align: AlignmentType.LEFT }),
 p([r('2026 SEASON - PARENT & FAMILY GUIDE', { bold: true, size: 20, color: GS_BLUE_LIGHT, caps: true })], { align: AlignmentType.LEFT }),
 p([r('Where your money goes. What we are building. Why it matters.', { size: 18, color: GS_BLUE_LIGHT, italics: true })], { align: AlignmentType.LEFT }),
 ]
 })]
 })]
 });
}

// Section header
function section(title, sub = '') {
 return new Table({
 width: { size: 9360, type: WidthType.DXA }, columnWidths: [120, 9240],
 rows: [new TableRow({
 children: [
 new TableCell({ borders: NOB, shading: { fill: GS_BLUE_LIGHT, type: ShadingType.CLEAR }, width: { size: 120, type: WidthType.DXA }, children: [p([r('')])] }),
 new TableCell({
 borders: NOB, shading: { fill: GS_BLUE, type: ShadingType.CLEAR },
 margins: { top: 140, bottom: 140, left: 220, right: 220 },
 children: [
 p([r(title, { bold: true, size: 24, color: GS_WHITE, caps: true })]),
 ...(sub ? [p([r(sub, { size: 17, color: GS_BLUE_LIGHT })])] : [])
 ]
 })
 ]
 })]
 });
}

function subhead(text) {
 return p([r(text, { bold: true, size: 21, color: GS_BLUE, caps: true })], { before: 140, after: 80, border: true });
}

function thead(cols, widths) {
 return new TableRow({
 tableHeader: true,
 children: cols.map((c, i) => new TableCell({
 borders: NOB, shading: { fill: GS_BLUE, type: ShadingType.CLEAR },
 width: { size: widths[i], type: WidthType.DXA },
 margins: { top: 100, bottom: 100, left: 120, right: 120 },
 verticalAlign: VerticalAlign.CENTER,
 children: [p([r(c, { bold: true, size: 17, color: GS_WHITE, caps: true })])]
 }))
 });
}

function trow(cells, widths, alt = false, bg = null) {
 return new TableRow({
 children: cells.map((c, i) => new TableCell({
 borders: ROW_B, shading: { fill: bg || (alt ? GS_BLUE_PALE : GS_WHITE), type: ShadingType.CLEAR },
 width: { size: widths[i], type: WidthType.DXA },
 margins: { top: 80, bottom: 80, left: 120, right: 120 },
 children: [p([r(String(c), { size: 18, color: GS_DARK })])]
 }))
 });
}

function ttotal(cells, widths) {
 return new TableRow({
 children: cells.map((c, i) => new TableCell({
 borders: { top: BLUE_LINE, bottom: NO, left: NO, right: NO },
 shading: { fill: GS_BLUE_PALE, type: ShadingType.CLEAR },
 width: { size: widths[i], type: WidthType.DXA },
 margins: { top: 100, bottom: 100, left: 120, right: 120 },
 children: [p([r(String(c), { bold: true, size: 18, color: GS_BLUE })])]
 }))
 });
}

function callout(label, value, note = '', type = 'blue') {
 const borders = type === 'green' ? GREEN_LEFT : BLUE_LEFT;
 const labelColor = type === 'green' ? STATUS_GREEN_T : GS_BLUE;
 const bg = type === 'green' ? STATUS_GREEN : GS_BLUE_PALE;
 return new Table({
 width: { size: 9360, type: WidthType.DXA }, columnWidths: [9360],
 rows: [new TableRow({
 children: [new TableCell({
 borders, shading: { fill: bg, type: ShadingType.CLEAR },
 margins: { top: 120, bottom: 120, left: 220, right: 220 },
 children: [
 p([r(label, { bold: true, size: 17, color: labelColor, caps: true })]),
 p([r(value, { bold: true, size: 28, color: GS_DARK })]),
 ...(note ? [p([r(note, { size: 16, color: GS_GRAY, italics: true })])] : [])
 ]
 })]
 })]
 });
}

// Big bold mission statement block
function missionBlock(line1, line2) {
 return new Table({
 width: { size: 9360, type: WidthType.DXA }, columnWidths: [9360],
 rows: [new TableRow({
 children: [new TableCell({
 borders: { top: BLUE_LINE, bottom: BLUE_LINE, left: NO, right: NO },
 shading: { fill: GS_BLUE_PALE, type: ShadingType.CLEAR },
 margins: { top: 200, bottom: 200, left: 300, right: 300 },
 children: [
 p([r(line1, { bold: true, size: 28, color: GS_BLUE })], { align: AlignmentType.CENTER }),
 p([r(line2, { size: 20, color: GS_GRAY, italics: true })], { align: AlignmentType.CENTER }),
 ]
 })]
 })]
 });
}

// Two-column info row (icon-style label + content)
function infoRow(label, content, alt = false) {
 return new TableRow({
 children: [
 new TableCell({
 borders: ROW_B, shading: { fill: GS_BLUE, type: ShadingType.CLEAR },
 width: { size: 2200, type: WidthType.DXA },
 margins: { top: 100, bottom: 100, left: 140, right: 140 },
 verticalAlign: VerticalAlign.CENTER,
 children: [p([r(label, { bold: true, size: 18, color: GS_WHITE })])]
 }),
 new TableCell({
 borders: ROW_B, shading: { fill: alt ? GS_BLUE_PALE : GS_WHITE, type: ShadingType.CLEAR },
 width: { size: 7160, type: WidthType.DXA },
 margins: { top: 100, bottom: 100, left: 160, right: 160 },
 children: [p([r(content, { size: 18, color: GS_DARK })])]
 })
 ]
 });
}

// ═══════════════════════════════════════════════════════════════════════════
const doc = new Document({
 styles: { default: { document: { run: { font: 'Calibri', size: 20, color: GS_DARK } } } },
 sections: [{
 properties: {
 page: { size: { width: 12240, height: 15840 }, margin: { top: 1080, right: 1080, bottom: 1080, left: 1080 } }
 },
 children: [

 // ── COVER ─────────────────────────────────────────────────────────
 cover(),
 gap(180),

 // ── WELCOME ───────────────────────────────────────────────────────
 missionBlock(
 'Thank you for being part of the Godspeed family.',
 'This guide covers what to expect financially for the 2026 season and how you can help.'
 ),
 gap(160),

 // ── SECTION 1: WHAT WE ARE BUILDING ──────────────────────────────
 section('What We Are Building', 'The vision behind every dollar spent'),
 gap(120),

 p([r('Your child is part of something bigger than a basketball team.', { bold: true, size: 22, color: GS_BLUE })], { after: 100 }),
 p([r('Club Godspeed is a long-term development program built around one goal: giving Denver kids access to elite basketball development regardless of their financial situation. We compete at the highest regional level, train year-round, and build players who are ready for high school, college exposure, and beyond.', { size: 19, color: GS_DARK })], { after: 120 }),

 new Table({
 width: { size: 9360, type: WidthType.DXA }, columnWidths: [9360],
 rows: [
 infoRow('11 Players', '5 fourth graders + 6 fifth graders on the 2026 roster'),
 infoRow('12 Tournaments', '6 events per team across Spring 2026 - the best regional competition available', true),
 infoRow('3x Per Week', 'Year-round practice. We do not slow down during tournament weeks.'),
 infoRow('Vegas 2027', 'Every session this summer is building toward Hi-Top Risen - a national elite event', true),
 ]
 }),
 gap(200),

 // ── SECTION 2: WHERE THE MONEY GOES ──────────────────────────────
 section('Where Your Money Goes', 'Every dollar is accounted for - nothing hidden'),
 gap(120),

 p([r('We run a transparent program. Here is exactly what the 2026 season costs and what it covers.', { size: 19, color: GS_DARK })], { after: 120 }),

 subhead('Tournament Schedule'),
 p([r('Both teams compete in 6 tournaments each. Entry fees go directly to event organizers - we do not mark these up.', { size: 18, color: GS_GRAY, italics: true })], { after: 80 }),

 new Table({
 width: { size: 9360, type: WidthType.DXA },
 columnWidths: [4760, 2300, 2300],
 rows: [
 thead(['Tournament', '4th Grade', '5th Grade'], [4760, 2300, 2300]),
 trow(['iHoop Spring Classic', '$325', '$325'], [4760, 2300, 2300]),
 trow(['BigFoot Battle of the Rockies', '$395', '$395'], [4760, 2300, 2300], true),
 trow(['iHoop Spring Showdown', '$425', '$425'], [4760, 2300, 2300]),
 trow(['JPS Tournament #1', '$325', '$325'], [4760, 2300, 2300], true),
 trow(['JPS Tournament #2', '$325', '$325'], [4760, 2300, 2300]),
 trow(['Gold Crown Spring Hoops Classic', '$475', '$475'], [4760, 2300, 2300], true),
 ttotal(['Total Per Team', '$2,270', '$2,270'], [4760, 2300, 2300]),
 ]
 }),
 gap(80),
 p([r('12 tournaments total. Both teams. Both competing at the same level.', { size: 16, color: GS_GRAY, italics: true })]),
 gap(160),

 subhead('Practice Gym'),
 p([r('We practice at FDES Gymnasium through Denver Public Schools Community Use. Gym time is billed at $12.50/hr - one of the most affordable rates available in Denver.', { size: 18, color: GS_GRAY, italics: true })], { after: 80 }),

 new Table({
 width: { size: 9360, type: WidthType.DXA },
 columnWidths: [2600, 2200, 1780, 1380, 1400],
 rows: [
 thead(['Period', 'Schedule', 'Sessions', 'Rate', 'Cost'], [2600, 2200, 1780, 1380, 1400]),
 trow(['Spring 2026', 'Mar - May | 3x/week', '36 sessions', '$25/session', '$900'], [2600, 2200, 1780, 1380, 1400]),
 trow(['Summer 2026', 'Jun - Jul | 3x/week', '24 sessions', '$25/session', '$600'], [2600, 2200, 1780, 1380, 1400], true),
 ttotal(['Total Gym Cost', '', '60 sessions', '', '$1,500'], [2600, 2200, 1780, 1380, 1400]),
 ]
 }),
 gap(80),
 p([r('Summer is training-only - no tournaments. This is intentional. The summer block is where players make their biggest jumps before the following season.', { size: 16, color: GS_GRAY, italics: true })]),
 gap(160),

 subhead('Full Season Cost Breakdown'),
 new Table({
 width: { size: 9360, type: WidthType.DXA },
 columnWidths: [5960, 3400],
 rows: [
 thead(['What It Covers', 'Cost'], [5960, 3400]),
 trow(['6 tournaments - 4th grade team', '$2,270'], [5960, 3400]),
 trow(['6 tournaments - 5th grade team', '$2,270'], [5960, 3400], true),
 trow(['Gym time - Spring 2026 (Mar-May)', '$900'], [5960, 3400]),
 trow(['Gym time - Summer 2026 (Jun-Jul)', '$600'], [5960, 3400], true),
 ttotal(['Total 2026 Program Cost', '$6,040'], [5960, 3400]),
 ]
 }),
 gap(80),
 p([r('Uniforms are a separate club investment - not included in the fees above. They are built to last 2-3 seasons.', { size: 16, color: GS_GRAY, italics: true })]),
 gap(200),

 // ── SECTION 3: WHAT PARENTS OWE ──────────────────────────────────
 section('What Parents Owe', 'Simple. Transparent. No surprises.'),
 gap(120),

 p([r('We know not every family is in the same financial position. That is not a barrier to playing for Godspeed.', { bold: true, size: 20, color: GS_BLUE })], { after: 100 }),
 p([r('Here is the suggested fee for the Spring/Summer 2026 season:', { size: 19, color: GS_DARK })], { after: 100 }),

 new Table({
 width: { size: 9360, type: WidthType.DXA },
 columnWidths: [4680, 4680],
 rows: [
 thead(['Grade', 'Suggested Season Fee'], [4680, 4680]),
 trow(['4th Grade', '$480'], [4680, 4680]),
 trow(['5th Grade', '$500'], [4680, 4680], true),
 ]
 }),
 gap(120),

 callout('Can you pay?', 'Please pay the suggested fee when you are able.',
 'Payments go directly toward tournament entry and gym time. Every dollar helps reduce the fundraising gap.', 'green'),
 gap(80),
 callout('Cannot pay right now?', 'Your player still competes. Full stop.',
 'We set our fundraising goal to cover 100% of program costs so that no player sits out because of finances. Participate in the fundraiser instead - every share and donor contact helps the whole team.'),
 gap(200),

 // ── SECTION 4: THE FUNDRAISING ASK ───────────────────────────────
 section('The Fundraising Ask', 'Vertical Raise Campaign | Goal: $6,040'),
 gap(120),

 missionBlock(
 'We are raising $6,040 - the full cost of the season.',
 'If we hit the goal, no family owes anything. Every parent payment becomes a head start on Fall 2026.'
 ),
 gap(140),

 p([r('How the fundraiser works', { bold: true, size: 21, color: GS_BLUE, caps: true })], { before: 80, after: 80, border: true }),
 gap(80),

 new Table({
 width: { size: 9360, type: WidthType.DXA }, columnWidths: [9360],
 rows: [
 infoRow('Step 1', 'You receive a personal Vertical Raise fundraising link'),
 infoRow('Step 2', 'Share it - family, friends, coworkers, social media, group chats', true),
 infoRow('Step 3', 'Donors give directly through the platform - secure and simple'),
 infoRow('Step 4', 'Every dollar raised reduces what families need to pay', true),
 infoRow('Step 5', 'We hit the goal together. Season is fully funded.'),
 ]
 }),
 gap(140),

 p([r('What happens at each fundraising milestone', { bold: true, size: 21, color: GS_BLUE, caps: true })], { before: 80, after: 80, border: true }),
 gap(80),

 new Table({
 width: { size: 9360, type: WidthType.DXA },
 columnWidths: [2400, 2320, 2320, 2320],
 rows: [
 thead(['Families Paying', 'Parent Fees Collected', 'Still Needed from Fundraising', 'Fall 2026 Surplus'], [2400, 2320, 2320, 2320]),
 trow(['0 of 11', '$0', '$6,040', '$0'], [2400, 2320, 2320, 2320]),
 trow(['3 of 11', '~$1,470', '~$4,570', '$0'], [2400, 2320, 2320, 2320], true),
 trow(['5 of 11', '~$2,450', '~$3,590', '$0'], [2400, 2320, 2320, 2320]),
 trow(['8 of 11', '~$3,920', '~$2,120', '$0'], [2400, 2320, 2320, 2320], true),
 trow(['All 11 families pay', '$5,400', '$640 still needed', '+$4,760 surplus'], [2400, 2320, 2320, 2320], false, STATUS_GREEN),
 ttotal(['Goal: Raise full $6,040', 'No gap - ever', 'Zero shortfall', 'All parent fees = surplus'], [2400, 2320, 2320, 2320]),
 ]
 }),
 gap(80),
 p([r('Even if every single family pays their full suggested fee, the fundraiser still needs to raise $640 to fully cover the season. Hitting $6,040 means we are never short - no matter what.', { size: 16, color: GS_GRAY, italics: true })]),
 gap(200),

 // ── SECTION 5: SEASON SCHEDULE ────────────────────────────────────
 section('2026 Season at a Glance', 'What your player is training and competing toward'),
 gap(120),

 new Table({
 width: { size: 9360, type: WidthType.DXA }, columnWidths: [9360],
 rows: [
 infoRow('March 2026', 'Spring season opens. Practice 3x/week begins.'),
 infoRow('April 2026', 'JPS Tournament #1 - Apr 25-26. Practice continues 3x/week.', true),
 infoRow('May 2026', 'Gold Crown May 1-3. JPS Tournament #2 early May. Spring wraps end of May.'),
 infoRow('June - July 2026', 'Summer training block. 3x/week. No tournaments. Pure development.', true),
 infoRow('Late July', 'Break begins. Players rest and reset.'),
 infoRow('Fall 2026', 'Program resumes late September. New season, new goals.', true),
 infoRow('2027', 'Building toward Hi-Top Risen in Las Vegas - national elite exposure.'),
 ]
 }),
 gap(160),

 // Final callout
 new Table({
 width: { size: 9360, type: WidthType.DXA }, columnWidths: [9360],
 rows: [new TableRow({
 children: [new TableCell({
 borders: { top: BLUE_LINE, bottom: BLUE_LINE, left: NO, right: NO },
 shading: { fill: GS_BLUE_DARK, type: ShadingType.CLEAR },
 margins: { top: 240, bottom: 240, left: 300, right: 300 },
 children: [
 p([r('We do not chase trophies.', { bold: true, size: 26, color: GS_WHITE })], { align: AlignmentType.CENTER }),
 p([r('We build players who are ready when the big moments come.', { size: 20, color: GS_BLUE_LIGHT, italics: true })], { align: AlignmentType.CENTER }),
 gap(60),
 p([r('Thank you for investing in your player and in this program.', { size: 18, color: GS_BLUE_LIGHT })], { align: AlignmentType.CENTER }),
 ]
 })]
 })]
 }),
 gap(160),

 // Footer
 new Table({
 width: { size: 9360, type: WidthType.DXA }, columnWidths: [9360],
 rows: [new TableRow({
 children: [new TableCell({
 borders: { top: BLUE_LINE, bottom: NO, left: NO, right: NO },
 shading: { fill: GS_WHITE, type: ShadingType.CLEAR },
 margins: { top: 100, bottom: 60, left: 0, right: 0 },
 children: [p([
 r('CLUB GODSPEED', { bold: true, size: 16, color: GS_BLUE }),
 r(' | clubgodspeed.com | Spring 2026 | Questions? Reach out to your coach directly.', { size: 16, color: GS_GRAY })
 ], { align: AlignmentType.CENTER })]
 })]
 })]
 }),

 ]
 }]
});

const outputPath = path.join(__dirname, 'Godspeed_Parent_Guide_2026.docx');
Packer.toBuffer(doc).then(buf => {
 fs.writeFileSync(outputPath, buf);
 console.log('Done:', buf.length, 'bytes');
 console.log('Saved to:', outputPath);
});
