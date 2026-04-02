'use strict';

const express     = require('express');
const path        = require('path');
const fs          = require('fs');
const cors        = require('cors');
const compression = require('compression');
const rateLimit   = require('express-rate-limit');
const crypto      = require('crypto');

const app  = express();
const PORT = process.env.PORT || 3000;

// ── NODEMAILER (optional) ──────────────────────────────────────────────────
let transporter = null;
try {
  const nodemailer = require('nodemailer');
  if (process.env.GMAIL_USER && process.env.GMAIL_PASS) {
    transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: { user: process.env.GMAIL_USER, pass: process.env.GMAIL_PASS },
    });
    transporter.verify(err => {
      if (err) { console.warn('Email error:', err.message); transporter = null; }
      else { console.log('✅ Email ready:', process.env.GMAIL_USER); }
    });
  } else {
    console.log('ℹ️  No email config — simulation mode.');
  }
} catch (_) {
  console.log('ℹ️  nodemailer not available.');
}

// ── DATA STORE ────────────────────────────────────────────────────────────
const DATA_DIR = path.join(__dirname, 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

function dataFile(name) { return path.join(DATA_DIR, name); }
function readJSON(name) {
  try { return JSON.parse(fs.readFileSync(dataFile(name), 'utf8')); } catch { return []; }
}
function writeJSON(name, data) {
  fs.writeFileSync(dataFile(name), JSON.stringify(data, null, 2), 'utf8');
}

['bookings.json', 'inquiries.json', 'emailLogs.json'].forEach(f => {
  if (!fs.existsSync(dataFile(f))) writeJSON(f, []);
});

// ── SESSIONS ──────────────────────────────────────────────────────────────
const sessions  = new Map();
const SESSION_TTL = 8 * 60 * 60 * 1000;

function createSession(username) {
  const token = crypto.randomBytes(32).toString('hex');
  sessions.set(token, { username, createdAt: Date.now() });
  return token;
}
function getSession(token) {
  const s = sessions.get(token);
  if (!s) return null;
  if (Date.now() - s.createdAt > SESSION_TTL) { sessions.delete(token); return null; }
  return s;
}
setInterval(() => {
  const now = Date.now();
  sessions.forEach((s, t) => { if (now - s.createdAt > SESSION_TTL) sessions.delete(t); });
}, 60 * 60 * 1000);

// ── MIDDLEWARE ────────────────────────────────────────────────────────────
// NO helmet - it was blocking fetch calls via CSP
app.use(compression());
app.use(cors({ origin: '*' }));
app.use(express.json({ limit: '500kb' }));
app.use(express.urlencoded({ extended: true }));

// ── RATE LIMITERS ─────────────────────────────────────────────────────────
const formLimiter  = rateLimit({ windowMs: 15*60*1000, max: 50,  message: { error: 'Too many requests.' }, standardHeaders: true, legacyHeaders: false });
const loginLimiter = rateLimit({ windowMs: 15*60*1000, max: 20,  message: { error: 'Too many login attempts.' }, standardHeaders: true, legacyHeaders: false });
const adminLimiter = rateLimit({ windowMs:  1*60*1000, max: 200, standardHeaders: true, legacyHeaders: false });

// ── AUTH MIDDLEWARE ───────────────────────────────────────────────────────
function requireAuth(req, res, next) {
  const token = req.headers['x-session-token'] || req.query.token;
  if (!token || !getSession(token)) {
    return res.status(401).json({ error: 'Unauthorized. Please log in.' });
  }
  next();
}

// ── EMAIL ─────────────────────────────────────────────────────────────────
async function sendEmail({ to, subject, html, type='general', recipientName='' }) {
  const logs = readJSON('emailLogs.json');
  const entry = {
    id: 'EL-' + Date.now(),
    type, to, recipientName, subject,
    sentAt: new Date().toISOString(),
    status: 'sent',
    simulated: !transporter,
  };
  if (transporter) {
    try {
      await transporter.sendMail({
        from: `"Kenya045 Media Hub" <${process.env.GMAIL_USER}>`,
        to, subject, html,
      });
    } catch (err) {
      entry.status = 'failed';
      entry.error  = err.message;
      console.error('Email error:', err.message);
    }
  } else {
    console.log(`[EMAIL SIM] To: ${to} | Subject: ${subject}`);
  }
  logs.push(entry);
  writeJSON('emailLogs.json', logs);
  return entry;
}

// ── EMAIL TEMPLATES ───────────────────────────────────────────────────────
const brand = (body) => `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;background:#0f0f0f;color:#f5f0e8;border-radius:10px;overflow:hidden;"><div style="background:#c9922a;padding:24px 32px;text-align:center;"><h1 style="margin:0;font-size:20px;color:#000;letter-spacing:2px;">KENYA045 MEDIA HUB</h1><p style="margin:4px 0 0;font-size:11px;color:#3a2000;">PHOTOGRAPHY · VIDEOGRAPHY · DRONE</p></div>${body}<div style="background:#161616;padding:16px 32px;text-align:center;border-top:1px solid #333;"><p style="margin:0;font-size:12px;color:#888;">📞 0748 144 066 | ✉️ kenya045mediahub@gmail.com</p></div></div>`;

// ═══════════════════════════════════════════════════════════════════════════
// PUBLIC API ROUTES
// ═══════════════════════════════════════════════════════════════════════════

// Health
app.get('/api/health', (_req, res) => {
  res.json({
    status: 'ok',
    service: 'Kenya045 Media Hub v2.0',
    uptime: Math.round(process.uptime()),
    bookings: readJSON('bookings.json').length,
    inquiries: readJSON('inquiries.json').length,
    email: transporter ? 'configured' : 'simulated',
    timestamp: new Date().toISOString(),
  });
});

// ── POST /api/booking ─────────────────────────────────────────────────────
app.post('/api/booking', formLimiter, async (req, res) => {
  console.log('📅 Booking received:', JSON.stringify(req.body));

  const { fullName, email, phone, eventDate, eventType, county, venue, additional } = req.body;

  // Validate required fields
  const missing = [];
  if (!fullName || !String(fullName).trim()) missing.push('fullName');
  if (!email    || !String(email).trim())    missing.push('email');
  if (!phone    || !String(phone).trim())    missing.push('phone');
  if (!eventDate|| !String(eventDate).trim())missing.push('eventDate');
  if (!eventType|| !String(eventType).trim())missing.push('eventType');
  if (!county   || !String(county).trim())   missing.push('county');
  if (!venue    || !String(venue).trim())    missing.push('venue');

  if (missing.length) {
    console.log('❌ Missing fields:', missing);
    return res.status(400).json({ error: 'Missing required fields: ' + missing.join(', ') });
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: 'Invalid email address' });
  }

  const booking = {
    id         : 'BK-' + Date.now(),
    fullName   : String(fullName).trim(),
    email      : String(email).trim().toLowerCase(),
    phone      : String(phone).trim(),
    eventDate  : String(eventDate).trim(),
    eventType  : String(eventType).trim(),
    county     : String(county).trim(),
    venue      : String(venue).trim(),
    additional : String(additional || '').trim(),
    submittedAt: new Date().toISOString(),
    status     : 'pending',
    notes      : '',
  };

  const bookings = readJSON('bookings.json');
  bookings.push(booking);
  writeJSON('bookings.json', bookings);
  console.log(`✅ Booking saved: ${booking.id} — ${booking.fullName}`);

  // Send ack email (don't await — don't block response)
  sendEmail({
    to: booking.email,
    subject: `Booking Received — ${booking.id} | Kenya045 Media Hub`,
    html: brand(`<div style="padding:28px;"><h2 style="color:#c9922a;margin-top:0;">Booking Received! 🎉</h2><p>Hi <strong>${booking.fullName}</strong>,</p><p>We've received your booking request and will confirm availability within <strong>24 hours</strong>.</p><p><strong>Booking ID:</strong> ${booking.id}<br><strong>Event:</strong> ${booking.eventType}<br><strong>Date:</strong> ${booking.eventDate}<br><strong>Venue:</strong> ${booking.venue}, ${booking.county}</p><p>We'll reach you at <strong>${booking.phone}</strong>.</p></div>`),
    type: 'booking-ack',
    recipientName: booking.fullName,
  }).catch(console.error);

  res.status(201).json({
    success: true,
    message: 'Booking request received. We will contact you within 24 hours.',
    id: booking.id,
  });
});

// ── POST /api/inquiry ─────────────────────────────────────────────────────
app.post('/api/inquiry', formLimiter, async (req, res) => {
  console.log('✉️  Inquiry received:', JSON.stringify(req.body));

  const { inqName, inqEmail, inqPhone, inqSubject, inqMessage } = req.body;

  if (!inqName || !inqEmail || !inqSubject || !inqMessage) {
    return res.status(400).json({ error: 'Please fill in all required fields.' });
  }

  const inquiry = {
    id         : 'IQ-' + Date.now(),
    name       : String(inqName).trim(),
    email      : String(inqEmail).trim().toLowerCase(),
    phone      : String(inqPhone || '').trim(),
    subject    : String(inqSubject).trim(),
    message    : String(inqMessage).trim(),
    submittedAt: new Date().toISOString(),
    status     : 'new',
    notes      : '',
  };

  const inquiries = readJSON('inquiries.json');
  inquiries.push(inquiry);
  writeJSON('inquiries.json', inquiries);
  console.log(`✅ Inquiry saved: ${inquiry.id} — ${inquiry.name}`);

  sendEmail({
    to: inquiry.email,
    subject: `Enquiry Received — ${inquiry.id} | Kenya045 Media Hub`,
    html: brand(`<div style="padding:28px;"><h2 style="color:#c9922a;margin-top:0;">Enquiry Received ✅</h2><p>Hi <strong>${inquiry.name}</strong>,</p><p>Thank you for your enquiry about <strong>${inquiry.subject}</strong>. We'll reply within <strong>24 hours</strong>.</p><p><strong>Reference:</strong> ${inquiry.id}</p></div>`),
    type: 'inquiry-ack',
    recipientName: inquiry.name,
  }).catch(console.error);

  res.status(201).json({
    success: true,
    message: 'Enquiry received. We will reply within 24 hours.',
    id: inquiry.id,
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// AUTH ROUTES
// ═══════════════════════════════════════════════════════════════════════════

app.post('/api/auth/login', loginLimiter, (req, res) => {
  const { username, password } = req.body;
  const validUser = process.env.ADMIN_USERNAME || 'admin';
  const validPass = process.env.ADMIN_PASSWORD || 'K045@Admin2025!';
  if (username === validUser && password === validPass) {
    const token = createSession(username);
    return res.json({ success: true, token, expiresIn: SESSION_TTL });
  }
  res.status(401).json({ error: 'Invalid credentials' });
});

app.post('/api/auth/logout', (req, res) => {
  const token = req.headers['x-session-token'];
  if (token) sessions.delete(token);
  res.json({ success: true });
});

app.get('/api/auth/verify', (req, res) => {
  const token = req.headers['x-session-token'] || req.query.token;
  const s = token ? getSession(token) : null;
  if (!s) return res.status(401).json({ valid: false });
  res.json({ valid: true, username: s.username });
});

// ═══════════════════════════════════════════════════════════════════════════
// ADMIN DATA ROUTES
// ═══════════════════════════════════════════════════════════════════════════

app.get('/api/stats', requireAuth, adminLimiter, (_req, res) => {
  const bookings  = readJSON('bookings.json');
  const inquiries = readJSON('inquiries.json');
  const emails    = readJSON('emailLogs.json');
  const bStatus   = bookings.reduce((a, b) => { a[b.status] = (a[b.status]||0)+1; return a; }, {});
  const recent    = [...bookings.map(b=>({...b,_type:'booking'})), ...inquiries.map(i=>({...i,_type:'inquiry'}))]
    .sort((a,b)=>new Date(b.submittedAt)-new Date(a.submittedAt)).slice(0,10);
  res.json({
    bookings : { total: bookings.length,  ...bStatus },
    inquiries: { total: inquiries.length, new: inquiries.filter(i=>i.status==='new').length },
    emails   : { total: emails.length,    sent: emails.filter(e=>e.status==='sent').length },
    recent,
  });
});

app.get('/api/bookings', requireAuth, adminLimiter, (req, res) => {
  let data = readJSON('bookings.json');
  const { search='', status='', page=1, limit=20 } = req.query;
  if (search) { const q=search.toLowerCase(); data=data.filter(b=>b.fullName.toLowerCase().includes(q)||b.email.includes(q)||b.county.toLowerCase().includes(q)||b.eventType.toLowerCase().includes(q)); }
  if (status) data = data.filter(b=>b.status===status);
  data.sort((a,b)=>new Date(b.submittedAt)-new Date(a.submittedAt));
  const total = data.length;
  const start = (parseInt(page)-1)*parseInt(limit);
  res.json({ total, page:parseInt(page), limit:parseInt(limit), bookings: data.slice(start, start+parseInt(limit)) });
});

app.get('/api/bookings/:id', requireAuth, adminLimiter, (req, res) => {
  const b = readJSON('bookings.json').find(b=>b.id===req.params.id);
  if (!b) return res.status(404).json({ error: 'Not found' });
  res.json(b);
});

app.patch('/api/bookings/:id', requireAuth, adminLimiter, (req, res) => {
  const bookings = readJSON('bookings.json');
  const idx = bookings.findIndex(b=>b.id===req.params.id);
  if (idx===-1) return res.status(404).json({ error: 'Not found' });
  if (req.body.status !== undefined) bookings[idx].status = req.body.status;
  if (req.body.notes  !== undefined) bookings[idx].notes  = req.body.notes;
  bookings[idx].updatedAt = new Date().toISOString();
  writeJSON('bookings.json', bookings);
  res.json(bookings[idx]);
});

app.delete('/api/bookings/:id', requireAuth, adminLimiter, (req, res) => {
  let data = readJSON('bookings.json');
  if (!data.some(b=>b.id===req.params.id)) return res.status(404).json({ error: 'Not found' });
  writeJSON('bookings.json', data.filter(b=>b.id!==req.params.id));
  res.json({ success: true });
});

app.get('/api/inquiries', requireAuth, adminLimiter, (req, res) => {
  let data = readJSON('inquiries.json');
  const { search='', status='', page=1, limit=20 } = req.query;
  if (search) { const q=search.toLowerCase(); data=data.filter(i=>i.name.toLowerCase().includes(q)||i.email.includes(q)||i.subject.toLowerCase().includes(q)); }
  if (status) data = data.filter(i=>i.status===status);
  data.sort((a,b)=>new Date(b.submittedAt)-new Date(a.submittedAt));
  const total = data.length;
  const start = (parseInt(page)-1)*parseInt(limit);
  res.json({ total, page:parseInt(page), limit:parseInt(limit), inquiries: data.slice(start, start+parseInt(limit)) });
});

app.get('/api/inquiries/:id', requireAuth, adminLimiter, (req, res) => {
  const i = readJSON('inquiries.json').find(i=>i.id===req.params.id);
  if (!i) return res.status(404).json({ error: 'Not found' });
  res.json(i);
});

app.patch('/api/inquiries/:id', requireAuth, adminLimiter, (req, res) => {
  const data = readJSON('inquiries.json');
  const idx  = data.findIndex(i=>i.id===req.params.id);
  if (idx===-1) return res.status(404).json({ error: 'Not found' });
  if (req.body.status !== undefined) data[idx].status = req.body.status;
  if (req.body.notes  !== undefined) data[idx].notes  = req.body.notes;
  data[idx].updatedAt = new Date().toISOString();
  writeJSON('inquiries.json', data);
  res.json(data[idx]);
});

app.delete('/api/inquiries/:id', requireAuth, adminLimiter, (req, res) => {
  let data = readJSON('inquiries.json');
  if (!data.some(i=>i.id===req.params.id)) return res.status(404).json({ error: 'Not found' });
  writeJSON('inquiries.json', data.filter(i=>i.id!==req.params.id));
  res.json({ success: true });
});

// ── EMAIL ACTIONS ─────────────────────────────────────────────────────────
app.post('/api/bookings/:id/confirm', requireAuth, adminLimiter, async (req, res) => {
  const bookings = readJSON('bookings.json');
  const idx = bookings.findIndex(b=>b.id===req.params.id);
  if (idx===-1) return res.status(404).json({ error: 'Not found' });
  const b = bookings[idx];
  bookings[idx].status = 'confirmed';
  bookings[idx].updatedAt = new Date().toISOString();
  writeJSON('bookings.json', bookings);
  const log = await sendEmail({
    to: b.email,
    subject: `Booking Confirmed — ${b.id} | Kenya045 Media Hub`,
    html: brand(`<div style="padding:28px;"><h2 style="color:#c9922a;margin-top:0;">Booking Confirmed! 📅</h2><p>Hi <strong>${b.fullName}</strong>, we've confirmed availability for your event.</p>${req.body.message?`<p>${req.body.message}</p>`:''}<p><strong>Event:</strong> ${b.eventType}<br><strong>Date:</strong> ${b.eventDate}<br><strong>Venue:</strong> ${b.venue}, ${b.county}</p><p>A 30% deposit is required to fully secure your date.</p></div>`),
    type: 'booking-confirm', recipientName: b.fullName,
  });
  res.json({ success: true, booking: bookings[idx], emailLog: log });
});

app.post('/api/bookings/:id/message', requireAuth, adminLimiter, async (req, res) => {
  const { message, newStatus } = req.body;
  if (!message) return res.status(400).json({ error: 'Message required' });
  const bookings = readJSON('bookings.json');
  const idx = bookings.findIndex(b=>b.id===req.params.id);
  if (idx===-1) return res.status(404).json({ error: 'Not found' });
  const b = bookings[idx];
  if (newStatus) { bookings[idx].status=newStatus; bookings[idx].updatedAt=new Date().toISOString(); writeJSON('bookings.json', bookings); }
  const log = await sendEmail({
    to: b.email,
    subject: `Update on Booking ${b.id} | Kenya045 Media Hub`,
    html: brand(`<div style="padding:28px;"><h2 style="color:#c9922a;margin-top:0;">Update on Your Booking</h2><p>Hi <strong>${b.fullName}</strong>,</p>${newStatus?`<p>Status: <strong>${newStatus}</strong></p>`:''}<div style="background:#1c1c1c;border-left:3px solid #c9922a;padding:14px;border-radius:4px;margin:16px 0;">${message}</div></div>`),
    type: 'booking-message', recipientName: b.fullName,
  });
  res.json({ success: true, emailLog: log });
});

app.post('/api/bookings/:id/feedback', requireAuth, adminLimiter, async (req, res) => {
  const { galleryLink='', deliverables='' } = req.body;
  const bookings = readJSON('bookings.json');
  const idx = bookings.findIndex(b=>b.id===req.params.id);
  if (idx===-1) return res.status(404).json({ error: 'Not found' });
  const b = bookings[idx];
  bookings[idx].status='delivered'; bookings[idx].updatedAt=new Date().toISOString();
  writeJSON('bookings.json', bookings);
  const log = await sendEmail({
    to: b.email,
    subject: `Your Files Are Ready! 📸 | Kenya045 Media Hub`,
    html: brand(`<div style="padding:28px;"><h2 style="color:#c9922a;margin-top:0;">Your Files Are Ready! 🎉</h2><p>Hi <strong>${b.fullName}</strong>, your photos/videos are ready.</p>${deliverables?`<ul>${deliverables.split('\n').map(d=>`<li>${d}</li>`).join('')}</ul>`:''} ${galleryLink?`<a href="${galleryLink}" style="display:inline-block;background:#c9922a;color:#000;padding:12px 24px;border-radius:4px;text-decoration:none;font-weight:700;margin-top:12px;">View Gallery →</a>`:''}</div>`),
    type: 'files-ready', recipientName: b.fullName,
  });
  res.json({ success: true, emailLog: log });
});

app.post('/api/inquiries/:id/reply', requireAuth, adminLimiter, async (req, res) => {
  const { replyText } = req.body;
  if (!replyText) return res.status(400).json({ error: 'Reply text required' });
  const data = readJSON('inquiries.json');
  const idx  = data.findIndex(i=>i.id===req.params.id);
  if (idx===-1) return res.status(404).json({ error: 'Not found' });
  data[idx].status='replied'; data[idx].updatedAt=new Date().toISOString();
  writeJSON('inquiries.json', data);
  const i = data[idx];
  const log = await sendEmail({
    to: i.email,
    subject: `Re: ${i.subject} | Kenya045 Media Hub`,
    html: brand(`<div style="padding:28px;"><h2 style="color:#c9922a;margin-top:0;">Reply to Your Enquiry</h2><p>Hi <strong>${i.name}</strong>,</p><div style="background:#1c1c1c;border-left:3px solid #c9922a;padding:14px;border-radius:4px;margin:16px 0;white-space:pre-wrap;">${replyText}</div><a href="https://kenya-045-media-hub-website-production.up.railway.app/#booking" style="display:inline-block;background:#c9922a;color:#000;padding:10px 22px;border-radius:4px;text-decoration:none;font-weight:700;margin-top:10px;">Book a Session →</a></div>`),
    type: 'inquiry-reply', recipientName: i.name,
  });
  res.json({ success: true, emailLog: log });
});

app.post('/api/email/broadcast', requireAuth, adminLimiter, async (req, res) => {
  const { audience, subject, message } = req.body;
  if (!audience || !subject || !message) return res.status(400).json({ error: 'audience, subject and message required' });
  const bookings  = readJSON('bookings.json');
  const inquiries = readJSON('inquiries.json');
  let recipients  = [];
  if (audience==='all-clients')    recipients=[...bookings,...inquiries.map(i=>({...i,fullName:i.name}))];
  else if (audience==='pending')   recipients=bookings.filter(b=>b.status==='pending');
  else if (audience==='confirmed') recipients=bookings.filter(b=>b.status==='confirmed');
  else if (audience==='new-inquiries') recipients=inquiries.filter(i=>i.status==='new');
  const seen=new Set();
  recipients=recipients.filter(r=>{if(seen.has(r.email))return false;seen.add(r.email);return true;});
  const html = brand(`<div style="padding:28px;"><p style="white-space:pre-wrap;">${message}</p></div>`);
  const results=[];
  for (const r of recipients) {
    const log=await sendEmail({to:r.email,subject,html,type:'broadcast',recipientName:r.fullName||r.name||''});
    results.push(log);
  }
  res.json({ success:true, sent:results.length, results });
});

app.get('/api/email/logs', requireAuth, adminLimiter, (req, res) => {
  let logs = readJSON('emailLogs.json');
  const { page=1, limit=30 } = req.query;
  logs.sort((a,b)=>new Date(b.sentAt)-new Date(a.sentAt));
  const total=logs.length, start=(parseInt(page)-1)*parseInt(limit);
  res.json({ total, page:parseInt(page), limit:parseInt(limit), logs:logs.slice(start,start+parseInt(limit)) });
});

// ═══════════════════════════════════════════════════════════════════════════
// STATIC FILES
// ═══════════════════════════════════════════════════════════════════════════
// Determine where the HTML files are (Railway copies index.html to public/)
const publicDir = fs.existsSync(path.join(__dirname, 'public', 'index.html'))
  ? path.join(__dirname, 'public')
  : __dirname;

console.log('📁 Serving static from:', publicDir);
app.use(express.static(publicDir, { maxAge: '1h', etag: true, index: false }));

app.get('/admin', (_req, res) => {
  const p = fs.existsSync(path.join(publicDir, 'admin.html'))
    ? path.join(publicDir, 'admin.html')
    : path.join(__dirname, 'admin.html');
  res.sendFile(p);
});

app.get('*', (_req, res) => {
  res.sendFile(path.join(publicDir, 'index.html'));
});

// ── ERROR HANDLER ─────────────────────────────────────────────────────────
app.use((err, _req, res, _next) => {
  console.error('Server error:', err.message);
  res.status(err.status || 500).json({ error: 'Internal server error' });
});

// ── START ──────────────────────────────────────────────────────────────────
app.listen(PORT, '0.0.0.0', () => {
  console.log(`\n🎬 Kenya045 Media Hub v2.0`);
  console.log(`   http://localhost:${PORT}`);
  console.log(`   Health: http://localhost:${PORT}/api/health`);
  console.log(`   Admin:  http://localhost:${PORT}/admin\n`);
});

module.exports = app;
