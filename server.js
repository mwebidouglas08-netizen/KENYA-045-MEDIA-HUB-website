'use strict';
const express      = require('express');
const path         = require('path');
const cors         = require('cors');
const helmet       = require('helmet');
const compression  = require('compression');
const rateLimit    = require('express-rate-limit');
const nodemailer   = require('nodemailer');
const crypto       = require('crypto');
const fs           = require('fs');

const app  = express();
const PORT = process.env.PORT || 3000;

// ─────────────────────────────────────────────────────────────────────────────
//  ADMIN CREDENTIALS  (set these as Railway environment variables)
// ─────────────────────────────────────────────────────────────────────────────
const ADMIN_USERNAME = process.env.ADMIN_USERNAME || 'admin';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'K045@Admin2025!';
const ADMIN_KEY      = process.env.ADMIN_KEY      || 'K045-ADMIN-SECRET-8f3a9d2e1b7c4f6a';

// ─────────────────────────────────────────────────────────────────────────────
//  EMAIL CONFIG  (set GMAIL_USER + GMAIL_PASS in Railway env vars)
//  Use a Gmail account + App Password (not your real password).
//  Guide: myaccount.google.com → Security → 2-Step → App passwords
// ─────────────────────────────────────────────────────────────────────────────
const GMAIL_USER  = process.env.GMAIL_USER  || '';   // e.g. kenya045mediahub@gmail.com
const GMAIL_PASS  = process.env.GMAIL_PASS  || '';   // 16-char App Password
const FROM_NAME   = 'Kenya045 Media Hub';
const FROM_EMAIL  = GMAIL_USER || 'noreply@kenya045.co.ke';
const BRAND_COLOR = '#c9922a';

let transporter = null;
if (GMAIL_USER && GMAIL_PASS) {
  transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: { user: GMAIL_USER, pass: GMAIL_PASS },
  });
  transporter.verify(err => {
    if (err) console.error('📧 Email transport error:', err.message);
    else     console.log('📧 Email transport ready →', GMAIL_USER);
  });
} else {
  console.warn('⚠️  GMAIL_USER / GMAIL_PASS not set — emails will be logged only');
}

// ─────────────────────────────────────────────────────────────────────────────
//  EMAIL HELPER
// ─────────────────────────────────────────────────────────────────────────────
async function sendEmail({ to, subject, html, text }) {
  const msg = { from: `"${FROM_NAME}" <${FROM_EMAIL}>`, to, subject, html, text: text || subject };
  if (transporter) {
    try { const info = await transporter.sendMail(msg); return { ok: true, id: info.messageId }; }
    catch (e) { console.error('sendEmail error:', e.message); return { ok: false, error: e.message }; }
  } else {
    console.log('📧 [SIMULATED EMAIL]', JSON.stringify({ to, subject }, null, 2));
    return { ok: true, id: `sim-${Date.now()}`, simulated: true };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
//  EMAIL TEMPLATES
// ─────────────────────────────────────────────────────────────────────────────
function baseTemplate(content) {
  return `<!DOCTYPE html><html><head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1.0"/></head><body style="margin:0;padding:0;background:#0f0f0f;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#0f0f0f;padding:40px 20px;">
  <tr><td align="center">
    <table width="600" cellpadding="0" cellspacing="0" style="background:#161616;border-radius:12px;overflow:hidden;border:1px solid rgba(255,255,255,0.08);">
      <tr><td style="background:linear-gradient(135deg,#080808,#1a1408);padding:32px 40px;border-bottom:2px solid ${BRAND_COLOR};">
        <table width="100%" cellpadding="0" cellspacing="0"><tr>
          <td><div style="display:inline-block;width:40px;height:40px;background:${BRAND_COLOR};border-radius:8px;text-align:center;line-height:40px;font-size:18px;font-weight:900;color:#080808;margin-bottom:12px;">K</div>
          <div style="font-family:Georgia,serif;font-size:22px;font-weight:700;color:#f5f0e8;letter-spacing:0.02em;">KENYA<span style="color:${BRAND_COLOR}">045</span> MEDIA HUB</div>
          <div style="font-size:11px;color:rgba(245,240,232,0.4);text-transform:uppercase;letter-spacing:0.15em;margin-top:4px;">Photography · Videography · Drone</div></td>
        </tr></table>
      </td></tr>
      <tr><td style="padding:40px;">${content}</td></tr>
      <tr><td style="background:#0d0d0d;padding:24px 40px;border-top:1px solid rgba(255,255,255,0.06);">
        <p style="margin:0;font-size:12px;color:rgba(245,240,232,0.3);text-align:center;">📞 0748 144 066 &nbsp;|&nbsp; ✉️ kenya045mediahub@gmail.com &nbsp;|&nbsp; 📍 All 47 Counties, Kenya</p>
        <p style="margin:8px 0 0;font-size:11px;color:rgba(245,240,232,0.2);text-align:center;">© 2025 Kenya045 Media Hub. All rights reserved.</p>
      </td></tr>
    </table>
  </td></tr>
</table></body></html>`;
}

function h2(text)  { return `<h2 style="font-family:Georgia,serif;font-size:22px;font-weight:700;color:#f5f0e8;margin:0 0 16px;">${text}</h2>`; }
function p(text)   { return `<p style="font-size:14px;color:rgba(245,240,232,0.7);line-height:1.7;margin:0 0 14px;">${text}</p>`; }
function badge(text, color='#c9922a') { return `<span style="display:inline-block;padding:4px 14px;background:${color}22;border:1px solid ${color}44;border-radius:99px;font-size:12px;font-weight:600;color:${color};text-transform:uppercase;letter-spacing:0.08em;">${text}</span>`; }
function divider()  { return `<hr style="border:none;border-top:1px solid rgba(255,255,255,0.07);margin:24px 0;"/>`; }
function detailRow(label, value) { return `<tr><td style="padding:10px 14px;font-size:12px;color:rgba(245,240,232,0.4);text-transform:uppercase;letter-spacing:0.1em;width:130px;vertical-align:top;">${label}</td><td style="padding:10px 14px;font-size:14px;color:#f5f0e8;font-weight:500;">${value}</td></tr>`; }
function detailTable(rows) { return `<table style="width:100%;border-collapse:collapse;background:#0d0d0d;border-radius:8px;overflow:hidden;border:1px solid rgba(255,255,255,0.06);">${rows}</table>`; }
function ctaButton(text, url) { return `<a href="${url}" style="display:inline-block;padding:14px 28px;background:${BRAND_COLOR};color:#080808;font-weight:700;font-size:14px;text-decoration:none;border-radius:6px;letter-spacing:0.06em;text-transform:uppercase;margin-top:20px;">${text}</a>`; }

// ─────────────────────────────────────────────────────────────────────────────
//  SESSION STORE
// ─────────────────────────────────────────────────────────────────────────────
const sessions = new Map();
function createSession(username) {
  const token = crypto.randomBytes(32).toString('hex');
  sessions.set(token, { username, createdAt: Date.now() });
  return token;
}
function getSession(token) {
  if (!token) return null;
  const s = sessions.get(token);
  if (!s) return null;
  if (Date.now() - s.createdAt > 8 * 3600 * 1000) { sessions.delete(token); return null; }
  return s;
}

// ─────────────────────────────────────────────────────────────────────────────
//  PERSISTENT DATA STORE
// ─────────────────────────────────────────────────────────────────────────────
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

function readJSON(file)        { try { const p = path.join(DATA_DIR, file); return fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf8')) : []; } catch { return []; } }
function writeJSON(file, data)  { try { fs.writeFileSync(path.join(DATA_DIR, file), JSON.stringify(data, null, 2)); } catch (e) { console.error('writeJSON:', e.message); } }

let bookings   = readJSON('bookings.json');
let inquiries  = readJSON('inquiries.json');
let emailLogs  = readJSON('emailLogs.json');

function logEmail(entry) { emailLogs.unshift({ ...entry, id: `ML-${Date.now()}`, ts: new Date().toISOString() }); if (emailLogs.length > 500) emailLogs = emailLogs.slice(0, 500); writeJSON('emailLogs.json', emailLogs); }

// ─────────────────────────────────────────────────────────────────────────────
//  MIDDLEWARE
// ─────────────────────────────────────────────────────────────────────────────
app.use(helmet({ contentSecurityPolicy: { directives: { defaultSrc:["'self'"], styleSrc:["'self'","'unsafe-inline'",'fonts.googleapis.com'], fontSrc:["'self'",'fonts.gstatic.com'], imgSrc:["'self'",'data:','https:'], scriptSrc:["'self'","'unsafe-inline'"], connectSrc:["'self'"] } } }));
app.use(compression());
app.use(cors());
app.use(express.json({ limit: '500kb' }));
app.use(express.urlencoded({ extended: true }));

const formLimiter  = rateLimit({ windowMs:15*60*1000, max:20, message:{ error:'Too many requests.' }, standardHeaders:true, legacyHeaders:false });
const loginLimiter = rateLimit({ windowMs:15*60*1000, max:10, message:{ error:'Too many login attempts.' }, standardHeaders:true, legacyHeaders:false });
const emailLimiter = rateLimit({ windowMs:60*60*1000, max:50, message:{ error:'Email rate limit reached.' }, standardHeaders:true, legacyHeaders:false });

function requireAuth(req, res, next) {
  const token = req.headers['x-session-token'] || req.query.token;
  if (!getSession(token)) return res.status(401).json({ error: 'Unauthorized' });
  next();
}
function requireApiKey(req, res, next) {
  const key = req.query.key || req.headers['x-admin-key'];
  const tok = req.headers['x-session-token'] || req.query.token;
  if (key === ADMIN_KEY || getSession(tok)) return next();
  return res.status(401).json({ error: 'Unauthorized' });
}

// ─────────────────────────────────────────────────────────────────────────────
//  PUBLIC ROUTES
// ─────────────────────────────────────────────────────────────────────────────
app.get('/api/health', (_req, res) => res.json({ status:'ok', service:'Kenya045 Media Hub', uptime:Math.round(process.uptime()), bookings:bookings.length, inquiries:inquiries.length, email: !!transporter, ts:new Date().toISOString() }));

// Submit booking
app.post('/api/booking', formLimiter, async (req, res) => {
  const { fullName, email, phone, eventDate, eventType, county, venue, additional } = req.body;
  const missing = ['fullName','email','phone','eventDate','eventType','county','venue'].filter(k => !req.body[k]?.toString().trim());
  if (missing.length) return res.status(400).json({ error: `Missing: ${missing.join(', ')}` });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ error: 'Invalid email' });

  const b = {
    id: `BK-${Date.now()}`, fullName:fullName.trim(), email:email.trim().toLowerCase(),
    phone:phone.trim(), eventDate:eventDate.trim(), eventType:eventType.trim(),
    county:county.trim(), venue:venue.trim(), additional:(additional||'').trim(),
    submittedAt:new Date().toISOString(), status:'pending', notes:'', emailHistory:[]
  };
  bookings.push(b);
  writeJSON('bookings.json', bookings);
  console.log(`📅 New booking: ${b.id} — ${b.fullName}`);

  // Auto-acknowledgement email to client
  const ackHtml = baseTemplate(`
    ${h2('Booking Request Received! 🎉')}
    ${p(`Hi <strong style="color:#f5f0e8">${b.fullName}</strong>, thank you for choosing Kenya045 Media Hub!`)}
    ${p('We have received your booking request and our team will review it and contact you within <strong style="color:${BRAND_COLOR}">24 hours</strong> to confirm availability and discuss your event in detail.')}
    ${divider()}
    <p style="font-size:12px;color:rgba(245,240,232,0.4);text-transform:uppercase;letter-spacing:0.12em;margin-bottom:12px;">Your Booking Summary</p>
    ${detailTable([
      detailRow('Booking ID', b.id),
      detailRow('Event Type', b.eventType),
      detailRow('Event Date', new Date(b.eventDate).toLocaleDateString('en-KE',{weekday:'long',year:'numeric',month:'long',day:'numeric'})),
      detailRow('County', b.county),
      detailRow('Venue', b.venue),
      detailRow('Status', '⏳ Pending Confirmation'),
    ].join(''))}
    ${divider()}
    ${p('For urgent enquiries, please reach us directly:')}
    <p style="font-size:14px;color:rgba(245,240,232,0.7);margin:0;">📞 <a href="tel:+254748144066" style="color:${BRAND_COLOR};text-decoration:none;font-weight:600;">0748 144 066</a></p>
    <p style="font-size:14px;color:rgba(245,240,232,0.7);margin:8px 0 0;">💬 <a href="https://wa.me/254748144066" style="color:${BRAND_COLOR};text-decoration:none;font-weight:600;">WhatsApp Us</a></p>
  `);
  const emailRes = await sendEmail({ to: b.email, subject: `Booking Received — ${b.id} | Kenya045 Media Hub`, html: ackHtml });
  logEmail({ type:'auto-ack', bookingId:b.id, to:b.email, subject:`Booking Received — ${b.id}`, status:emailRes.ok?'sent':'failed', simulated:emailRes.simulated });

  res.status(201).json({ success:true, message:'Booking received. Check your email for confirmation.', id:b.id });
});

// Submit inquiry
app.post('/api/inquiry', formLimiter, async (req, res) => {
  const { inqName, inqEmail, inqPhone, inqSubject, inqMessage } = req.body;
  if (!inqName || !inqEmail || !inqSubject || !inqMessage) return res.status(400).json({ error: 'Please fill all required fields.' });

  const i = {
    id:`IQ-${Date.now()}`, name:inqName.trim(), email:inqEmail.trim().toLowerCase(),
    phone:(inqPhone||'').trim(), subject:inqSubject.trim(), message:inqMessage.trim(),
    submittedAt:new Date().toISOString(), status:'new', notes:'', emailHistory:[]
  };
  inquiries.push(i);
  writeJSON('inquiries.json', inquiries);
  console.log(`✉️  New inquiry: ${i.id} — ${i.name}`);

  // Auto-ack to client
  const ackHtml = baseTemplate(`
    ${h2('Enquiry Received! ✅')}
    ${p(`Hi <strong style="color:#f5f0e8">${i.name}</strong>, thank you for reaching out to Kenya045 Media Hub!`)}
    ${p(`We have received your enquiry about <strong style="color:#f5f0e8">${i.subject}</strong> and will reply within <strong style="color:${BRAND_COLOR}">24 hours</strong>.`)}
    ${divider()}
    ${detailTable([
      detailRow('Reference', i.id),
      detailRow('Subject', i.subject),
      detailRow('Submitted', new Date(i.submittedAt).toLocaleString('en-KE')),
    ].join(''))}
  `);
  const emailRes = await sendEmail({ to: i.email, subject: `Enquiry Received — ${i.id} | Kenya045 Media Hub`, html: ackHtml });
  logEmail({ type:'auto-ack', inquiryId:i.id, to:i.email, subject:`Enquiry Received — ${i.id}`, status:emailRes.ok?'sent':'failed', simulated:emailRes.simulated });

  res.status(201).json({ success:true, message:'Enquiry received. Check your email for confirmation.', id:i.id });
});

// ─────────────────────────────────────────────────────────────────────────────
//  AUTH
// ─────────────────────────────────────────────────────────────────────────────
app.post('/api/auth/login', loginLimiter, (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'Username and password required.' });
  if (username !== ADMIN_USERNAME || password !== ADMIN_PASSWORD) return res.status(401).json({ error: 'Invalid credentials.' });
  const token = createSession(username);
  res.json({ success:true, token, username });
});
app.post('/api/auth/logout', (req, res) => { const t = req.headers['x-session-token']; if(t) sessions.delete(t); res.json({ success:true }); });
app.get('/api/auth/verify', requireAuth, (req, res) => { const s = getSession(req.headers['x-session-token']||req.query.token); res.json({ authenticated:true, username:s?.username }); });

// ─────────────────────────────────────────────────────────────────────────────
//  STATS
// ─────────────────────────────────────────────────────────────────────────────
app.get('/api/stats', requireApiKey, (_req, res) => {
  const mo = new Date().toISOString().slice(0,7);
  const byStatus = bookings.reduce((a,b)=>{ a[b.status]=(a[b.status]||0)+1; return a; },{});
  const topCounties = Object.entries(bookings.reduce((a,b)=>{ a[b.county]=(a[b.county]||0)+1; return a; },{})).sort((a,b)=>b[1]-a[1]).slice(0,5).map(([county,count])=>({county,count}));
  const topTypes = Object.entries(bookings.reduce((a,b)=>{ a[b.eventType]=(a[b.eventType]||0)+1; return a; },{})).sort((a,b)=>b[1]-a[1]).slice(0,5).map(([type,count])=>({type,count}));
  const recentBookings = [...bookings].sort((a,b)=>b.submittedAt.localeCompare(a.submittedAt)).slice(0,5);
  const recentInquiries = [...inquiries].sort((a,b)=>b.submittedAt.localeCompare(a.submittedAt)).slice(0,5);
  res.json({
    bookings:{ total:bookings.length, thisMonth:bookings.filter(b=>b.submittedAt.startsWith(mo)).length, byStatus },
    inquiries:{ total:inquiries.length, thisMonth:inquiries.filter(i=>i.submittedAt.startsWith(mo)).length, newCount:inquiries.filter(i=>i.status==='new').length },
    emails:{ total:emailLogs.length, sent:emailLogs.filter(e=>e.status==='sent').length },
    topCounties, topTypes, recentBookings, recentInquiries,
    emailConfigured: !!transporter,
  });
});

// ─────────────────────────────────────────────────────────────────────────────
//  BOOKINGS CRUD
// ─────────────────────────────────────────────────────────────────────────────
app.get('/api/bookings', requireApiKey, (req, res) => {
  const { status, search, sort='newest', page=1, limit=20 } = req.query;
  let r = [...bookings];
  if (status && status !== 'all') r = r.filter(b => b.status === status);
  if (search) { const q=search.toLowerCase(); r=r.filter(b=>b.fullName.toLowerCase().includes(q)||b.email.includes(q)||b.phone.includes(q)||b.eventType.toLowerCase().includes(q)||b.county.toLowerCase().includes(q)); }
  if (sort==='newest') r.sort((a,b)=>b.submittedAt.localeCompare(a.submittedAt));
  if (sort==='oldest') r.sort((a,b)=>a.submittedAt.localeCompare(b.submittedAt));
  if (sort==='event')  r.sort((a,b)=>a.eventDate.localeCompare(b.eventDate));
  const total=r.length, p=parseInt(page), l=parseInt(limit);
  res.json({ total, page:p, pages:Math.ceil(total/l)||1, bookings:r.slice((p-1)*l,p*l) });
});

app.get('/api/bookings/:id', requireApiKey, (req, res) => {
  const b = bookings.find(b => b.id === req.params.id);
  if (!b) return res.status(404).json({ error:'Not found' });
  res.json(b);
});

app.patch('/api/bookings/:id', requireApiKey, (req, res) => {
  const i = bookings.findIndex(b => b.id === req.params.id);
  if (i < 0) return res.status(404).json({ error:'Not found' });
  ['status','notes'].forEach(k => { if (req.body[k] !== undefined) bookings[i][k] = req.body[k]; });
  bookings[i].updatedAt = new Date().toISOString();
  writeJSON('bookings.json', bookings);
  res.json({ success:true, booking:bookings[i] });
});

app.delete('/api/bookings/:id', requireApiKey, (req, res) => {
  const i = bookings.findIndex(b => b.id === req.params.id);
  if (i < 0) return res.status(404).json({ error:'Not found' });
  bookings.splice(i, 1);
  writeJSON('bookings.json', bookings);
  res.json({ success:true });
});

// ─────────────────────────────────────────────────────────────────────────────
//  INQUIRIES CRUD
// ─────────────────────────────────────────────────────────────────────────────
app.get('/api/inquiries', requireApiKey, (req, res) => {
  const { status, search, sort='newest', page=1, limit=20 } = req.query;
  let r = [...inquiries];
  if (status && status !== 'all') r = r.filter(i => i.status === status);
  if (search) { const q=search.toLowerCase(); r=r.filter(i=>i.name.toLowerCase().includes(q)||i.email.includes(q)||i.subject.toLowerCase().includes(q)); }
  if (sort==='newest') r.sort((a,b)=>b.submittedAt.localeCompare(a.submittedAt));
  if (sort==='oldest') r.sort((a,b)=>a.submittedAt.localeCompare(b.submittedAt));
  const total=r.length, p=parseInt(page), l=parseInt(limit);
  res.json({ total, page:p, pages:Math.ceil(total/l)||1, inquiries:r.slice((p-1)*l,p*l) });
});

app.get('/api/inquiries/:id', requireApiKey, (req, res) => {
  const i = inquiries.find(i => i.id === req.params.id);
  if (!i) return res.status(404).json({ error:'Not found' });
  res.json(i);
});

app.patch('/api/inquiries/:id', requireApiKey, (req, res) => {
  const idx = inquiries.findIndex(i => i.id === req.params.id);
  if (idx < 0) return res.status(404).json({ error:'Not found' });
  ['status','notes'].forEach(k => { if (req.body[k] !== undefined) inquiries[idx][k] = req.body[k]; });
  inquiries[idx].updatedAt = new Date().toISOString();
  writeJSON('inquiries.json', inquiries);
  res.json({ success:true, inquiry:inquiries[idx] });
});

app.delete('/api/inquiries/:id', requireApiKey, (req, res) => {
  const idx = inquiries.findIndex(i => i.id === req.params.id);
  if (idx < 0) return res.status(404).json({ error:'Not found' });
  inquiries.splice(idx, 1);
  writeJSON('inquiries.json', inquiries);
  res.json({ success:true });
});

// ─────────────────────────────────────────────────────────────────────────────
//  EMAIL ROUTES  ← core new functionality
// ─────────────────────────────────────────────────────────────────────────────

// ── Confirm availability  (booking → confirmed)
app.post('/api/bookings/:id/confirm', requireApiKey, emailLimiter, async (req, res) => {
  const i = bookings.findIndex(b => b.id === req.params.id);
  if (i < 0) return res.status(404).json({ error:'Booking not found' });
  const b = bookings[i];
  const { message: customMsg, depositAmount } = req.body;

  bookings[i].status    = 'confirmed';
  bookings[i].updatedAt = new Date().toISOString();
  writeJSON('bookings.json', bookings);

  const html = baseTemplate(`
    ${badge('✅ Booking Confirmed', '#22c55e')}
    <br/><br/>
    ${h2(`Great news, ${b.fullName}! 🎉`)}
    ${p('We are thrilled to confirm your booking with Kenya045 Media Hub. Your date is locked in!')}
    ${customMsg ? `${divider()}<p style="font-size:14px;color:rgba(245,240,232,0.85);line-height:1.8;background:#0d0d0d;padding:16px 20px;border-radius:8px;border-left:3px solid ${BRAND_COLOR};">${customMsg.replace(/\n/g,'<br/>')}</p>` : ''}
    ${divider()}
    <p style="font-size:12px;color:rgba(245,240,232,0.4);text-transform:uppercase;letter-spacing:0.12em;margin-bottom:12px;">Confirmed Booking Details</p>
    ${detailTable([
      detailRow('Booking ID',  b.id),
      detailRow('Event Type',  b.eventType),
      detailRow('Event Date',  new Date(b.eventDate).toLocaleDateString('en-KE',{weekday:'long',year:'numeric',month:'long',day:'numeric'})),
      detailRow('County',      b.county),
      detailRow('Venue',       b.venue),
      detailRow('Status',      '✅ Confirmed'),
      ...(depositAmount ? [detailRow('Deposit Due', `KES ${depositAmount} (30% of package)`)] : []),
    ].join(''))}
    ${divider()}
    ${p('Our team will be in touch closer to your event date to finalise all the details. We are excited to work with you!')}
    ${p('📞 Questions? Call us anytime on <a href="tel:+254748144066" style="color:' + BRAND_COLOR + ';font-weight:600;">0748 144 066</a>')}
  `);

  const result = await sendEmail({ to:b.email, subject:`🎉 Booking Confirmed — ${b.id} | Kenya045 Media Hub`, html });
  const log = { type:'confirm', bookingId:b.id, to:b.email, subject:`Booking Confirmed — ${b.id}`, status:result.ok?'sent':'failed', simulated:result.simulated };
  logEmail(log);
  bookings[i].emailHistory = [...(bookings[i].emailHistory||[]), log];
  writeJSON('bookings.json', bookings);

  res.json({ success:true, email:result, booking:bookings[i] });
});

// ── Send update / message to booking client
app.post('/api/bookings/:id/message', requireApiKey, emailLimiter, async (req, res) => {
  const i = bookings.findIndex(b => b.id === req.params.id);
  if (i < 0) return res.status(404).json({ error:'Booking not found' });
  const b = bookings[i];
  const { subject, message, updateStatus } = req.body;
  if (!subject || !message) return res.status(400).json({ error:'Subject and message required' });

  if (updateStatus) { bookings[i].status = updateStatus; bookings[i].updatedAt = new Date().toISOString(); }

  const statusBadges = { pending:'⏳ Pending', confirmed:'✅ Confirmed', completed:'💙 Completed', cancelled:'❌ Cancelled' };
  const html = baseTemplate(`
    ${h2(`Update on Your Booking — ${b.id}`)}
    ${p(`Hi <strong style="color:#f5f0e8">${b.fullName}</strong>,`)}
    <div style="background:#0d0d0d;border-radius:8px;border-left:3px solid ${BRAND_COLOR};padding:20px 24px;margin:20px 0;">
      <p style="font-size:15px;color:#f5f0e8;line-height:1.8;margin:0;">${message.replace(/\n/g,'<br/>')}</p>
    </div>
    ${updateStatus ? `<p style="font-size:13px;margin:16px 0 0;">Booking status updated to: <strong style="color:${BRAND_COLOR};">${statusBadges[updateStatus]||updateStatus}</strong></p>` : ''}
    ${divider()}
    ${detailTable([
      detailRow('Booking ID', b.id),
      detailRow('Event Type', b.eventType),
      detailRow('Event Date', new Date(b.eventDate).toLocaleDateString('en-KE',{weekday:'long',year:'numeric',month:'long',day:'numeric'})),
      detailRow('Status', statusBadges[bookings[i].status]||bookings[i].status),
    ].join(''))}
    ${divider()}
    ${p('📞 <a href="tel:+254748144066" style="color:' + BRAND_COLOR + ';text-decoration:none;">0748 144 066</a> &nbsp; 💬 <a href="https://wa.me/254748144066" style="color:' + BRAND_COLOR + ';text-decoration:none;">WhatsApp</a>')}
  `);

  const result = await sendEmail({ to:b.email, subject:`${subject} | Kenya045 Media Hub`, html });
  const log = { type:'message', bookingId:b.id, to:b.email, subject, status:result.ok?'sent':'failed', simulated:result.simulated };
  logEmail(log);
  bookings[i].emailHistory = [...(bookings[i].emailHistory||[]), log];
  writeJSON('bookings.json', bookings);

  res.json({ success:true, email:result, booking:bookings[i] });
});

// ── Send feedback / delivery notification
app.post('/api/bookings/:id/feedback', requireApiKey, emailLimiter, async (req, res) => {
  const i = bookings.findIndex(b => b.id === req.params.id);
  if (i < 0) return res.status(404).json({ error:'Booking not found' });
  const b = bookings[i];
  const { message, galleryLink, deliverables, rating } = req.body;
  if (!message) return res.status(400).json({ error:'Message required' });

  bookings[i].status    = 'completed';
  bookings[i].updatedAt = new Date().toISOString();

  const html = baseTemplate(`
    ${badge('💙 Event Completed', '#60a5fa')}
    <br/><br/>
    ${h2(`Your Files Are Ready! 🎬`)}
    ${p(`Hi <strong style="color:#f5f0e8">${b.fullName}</strong>, it was a pleasure working with you!`)}
    <div style="background:#0d0d0d;border-radius:8px;border-left:3px solid #60a5fa;padding:20px 24px;margin:20px 0;">
      <p style="font-size:15px;color:#f5f0e8;line-height:1.8;margin:0;">${message.replace(/\n/g,'<br/>')}</p>
    </div>
    ${galleryLink ? `${divider()}<p style="font-size:13px;color:rgba(245,240,232,0.6);margin-bottom:12px;text-transform:uppercase;letter-spacing:0.1em;">📁 Your Private Gallery</p>${ctaButton('View Your Photos & Videos', galleryLink)}` : ''}
    ${deliverables ? `${divider()}<p style="font-size:12px;color:rgba(245,240,232,0.4);text-transform:uppercase;letter-spacing:0.12em;margin-bottom:12px;">What You Received</p><p style="font-size:14px;color:rgba(245,240,232,0.8);line-height:1.8;">${deliverables.replace(/\n/g,'<br/>')}</p>` : ''}
    ${rating ? `${divider()}<p style="font-size:14px;color:rgba(245,240,232,0.7);">We would love your feedback! <a href="https://wa.me/254748144066?text=Hi%20Kenya045%2C%20my%20rating%20for%20booking%20${b.id}%20is%3A" style="color:${BRAND_COLOR};font-weight:600;">Leave a WhatsApp review</a></p>` : ''}
    ${divider()}
    ${p('Thank you for choosing Kenya045 Media Hub. We hope to work with you again!')}
    ${p('📞 <a href="tel:+254748144066" style="color:' + BRAND_COLOR + ';text-decoration:none;">0748 144 066</a> &nbsp; 💬 <a href="https://wa.me/254748144066" style="color:' + BRAND_COLOR + ';text-decoration:none;">WhatsApp</a>')}
  `);

  const result = await sendEmail({ to:b.email, subject:`Your Files Are Ready — ${b.id} | Kenya045 Media Hub`, html });
  const log = { type:'feedback/delivery', bookingId:b.id, to:b.email, subject:`Files Ready — ${b.id}`, status:result.ok?'sent':'failed', simulated:result.simulated };
  logEmail(log);
  bookings[i].emailHistory = [...(bookings[i].emailHistory||[]), log];
  writeJSON('bookings.json', bookings);

  res.json({ success:true, email:result, booking:bookings[i] });
});

// ── Reply to inquiry
app.post('/api/inquiries/:id/reply', requireApiKey, emailLimiter, async (req, res) => {
  const idx = inquiries.findIndex(i => i.id === req.params.id);
  if (idx < 0) return res.status(404).json({ error:'Inquiry not found' });
  const inq = inquiries[idx];
  const { subject, message } = req.body;
  if (!subject || !message) return res.status(400).json({ error:'Subject and message required' });

  inquiries[idx].status    = 'replied';
  inquiries[idx].updatedAt = new Date().toISOString();

  const html = baseTemplate(`
    ${h2(`Re: ${inq.subject}`)}
    ${p(`Hi <strong style="color:#f5f0e8">${inq.name}</strong>, thank you for your enquiry!`)}
    <div style="background:#0d0d0d;border-radius:8px;border-left:3px solid ${BRAND_COLOR};padding:20px 24px;margin:20px 0;">
      <p style="font-size:15px;color:#f5f0e8;line-height:1.8;margin:0;">${message.replace(/\n/g,'<br/>')}</p>
    </div>
    ${divider()}
    ${p('Ready to book? Fill in our booking form or reach us directly:')}
    ${ctaButton('Book a Session', 'https://kenya-045-media-hub-website-production.up.railway.app/#booking')}
    ${divider()}
    ${p('📞 <a href="tel:+254748144066" style="color:' + BRAND_COLOR + ';text-decoration:none;">0748 144 066</a> &nbsp; 💬 <a href="https://wa.me/254748144066" style="color:' + BRAND_COLOR + ';text-decoration:none;">WhatsApp</a>')}
    <br/>
    <p style="font-size:11px;color:rgba(245,240,232,0.3);margin-top:20px;">Original enquiry reference: ${inq.id}</p>
  `);

  const result = await sendEmail({ to:inq.email, subject:`${subject} | Kenya045 Media Hub`, html });
  const log = { type:'inquiry-reply', inquiryId:inq.id, to:inq.email, subject, status:result.ok?'sent':'failed', simulated:result.simulated };
  logEmail(log);
  inquiries[idx].emailHistory = [...(inquiries[idx].emailHistory||[]), log];
  writeJSON('inquiries.json', inquiries);

  res.json({ success:true, email:result, inquiry:inquiries[idx] });
});

// ── Broadcast / bulk update email
app.post('/api/email/broadcast', requireApiKey, emailLimiter, async (req, res) => {
  const { subject, message, recipientType } = req.body;
  if (!subject || !message) return res.status(400).json({ error:'Subject and message required' });

  let recipients = [];
  if (recipientType === 'bookings-pending') recipients = bookings.filter(b=>b.status==='pending');
  if (recipientType === 'bookings-confirmed') recipients = bookings.filter(b=>b.status==='confirmed');
  if (recipientType === 'bookings-all') recipients = bookings;
  if (recipientType === 'inquiries-new') recipients = inquiries.filter(i=>i.status==='new');

  if (!recipients.length) return res.status(400).json({ error:'No recipients found for this filter' });

  const results = [];
  for (const r of recipients) {
    const name  = r.fullName || r.name;
    const email = r.email;
    const html  = baseTemplate(`
      ${h2('An Update from Kenya045 Media Hub')}
      ${p(`Hi <strong style="color:#f5f0e8">${name}</strong>,`)}
      <div style="background:#0d0d0d;border-radius:8px;border-left:3px solid ${BRAND_COLOR};padding:20px 24px;margin:20px 0;">
        <p style="font-size:15px;color:#f5f0e8;line-height:1.8;margin:0;">${message.replace(/\n/g,'<br/>')}</p>
      </div>
      ${divider()}
      ${p('📞 <a href="tel:+254748144066" style="color:' + BRAND_COLOR + ';text-decoration:none;">0748 144 066</a>')}
    `);
    const result = await sendEmail({ to:email, subject:`${subject} | Kenya045 Media Hub`, html });
    const log = { type:'broadcast', to:email, subject, status:result.ok?'sent':'failed', simulated:result.simulated };
    logEmail(log);
    results.push({ email, ok:result.ok });
    await new Promise(r=>setTimeout(r,300)); // Gentle rate limiting
  }
  res.json({ success:true, sent:results.filter(r=>r.ok).length, total:results.length, results });
});

// ── Email logs
app.get('/api/email/logs', requireApiKey, (req, res) => {
  const { page=1, limit=30 } = req.query;
  const p=parseInt(page), l=parseInt(limit);
  res.json({ total:emailLogs.length, page:p, pages:Math.ceil(emailLogs.length/l)||1, logs:emailLogs.slice((p-1)*l,p*l) });
});

// ─────────────────────────────────────────────────────────────────────────────
//  ADMIN PANEL + STATIC
// ─────────────────────────────────────────────────────────────────────────────
app.get('/admin', (_req,res) => res.sendFile(path.join(__dirname,'public','admin.html')));
app.get('/admin/*', (_req,res) => res.sendFile(path.join(__dirname,'public','admin.html')));
app.use(express.static(path.join(__dirname,'public'), { maxAge:'1d', etag:true }));
app.get('*', (_req,res) => {
  const p = path.join(__dirname,'public','index.html');
  res.sendFile(p, err => { if(err){ console.error(err.message); res.status(404).json({error:'Not found'}); } });
});
app.use((err,_req,res,_next) => { console.error(err.message); res.status(err.status||500).json({error:'Internal server error'}); });

// ─────────────────────────────────────────────────────────────────────────────
//  START
// ─────────────────────────────────────────────────────────────────────────────
app.listen(PORT,'0.0.0.0',()=>{
  console.log(`\n🎬 Kenya045 Media Hub — port ${PORT}`);
  console.log(`   Website: http://localhost:${PORT}`);
  console.log(`   Admin:   http://localhost:${PORT}/admin`);
  console.log(`   Email:   ${transporter ? '✅ configured' : '⚠️  not configured (set GMAIL_USER + GMAIL_PASS)'}\n`);
});
module.exports = app;
