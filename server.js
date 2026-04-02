'use strict';

const express     = require('express');
const path        = require('path');
const fs          = require('fs');
const cors        = require('cors');
const helmet      = require('helmet');
const compression = require('compression');
const rateLimit   = require('express-rate-limit');
const crypto      = require('crypto');

const app  = express();
const PORT = process.env.PORT || 3000;

// ── OPTIONAL NODEMAILER ────────────────────────────────────────────────────
let transporter = null;
try {
  const nodemailer = require('nodemailer');
  if (process.env.GMAIL_USER && process.env.GMAIL_PASS) {
    transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: { user: process.env.GMAIL_USER, pass: process.env.GMAIL_PASS },
    });
    transporter.verify(err => {
      if (err) { console.warn('⚠️  Email verify failed:', err.message); transporter = null; }
      else      { console.log('✅ Email ready:', process.env.GMAIL_USER); }
    });
  } else {
    console.log('ℹ️  Email not configured — running in simulation mode.');
  }
} catch (_) {
  console.log('ℹ️  nodemailer not installed — emails will be simulated.');
}

// ── PERSISTENT DATA STORE ─────────────────────────────────────────────────
const DATA_DIR = path.join(__dirname, 'data');
['bookings.json','inquiries.json','emailLogs.json'].forEach(f => {
  const fp = path.join(DATA_DIR, f);
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(fp)) fs.writeFileSync(fp, '[]', 'utf8');
});

function readJSON(file)       { try { return JSON.parse(fs.readFileSync(path.join(DATA_DIR, file), 'utf8')); } catch { return []; } }
function writeJSON(file, data){ fs.writeFileSync(path.join(DATA_DIR, file), JSON.stringify(data, null, 2), 'utf8'); }

// ── SESSION STORE (in-memory) ──────────────────────────────────────────────
const sessions = new Map(); // token → { username, createdAt }
const SESSION_TTL = 8 * 60 * 60 * 1000; // 8 hours

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
function destroySession(token) { sessions.delete(token); }

// Clean expired sessions every hour
setInterval(() => {
  const now = Date.now();
  sessions.forEach((s, t) => { if (now - s.createdAt > SESSION_TTL) sessions.delete(t); });
}, 60 * 60 * 1000);

// ── MIDDLEWARE ─────────────────────────────────────────────────────────────
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc : ["'self'"],
      styleSrc   : ["'self'", "'unsafe-inline'", 'fonts.googleapis.com'],
      fontSrc    : ["'self'", 'fonts.gstatic.com'],
      imgSrc     : ["'self'", 'data:', 'https:'],
      scriptSrc  : ["'self'", "'unsafe-inline'"],
      connectSrc : ["'self'"],
    },
  },
}));
app.use(compression());
app.use(cors());
app.use(express.json({ limit: '200kb' }));
app.use(express.urlencoded({ extended: true }));

// ── RATE LIMITERS ──────────────────────────────────────────────────────────
const formLimiter  = rateLimit({ windowMs: 15*60*1000, max: 15,  message: { error: 'Too many requests.' }, standardHeaders: true, legacyHeaders: false });
const loginLimiter = rateLimit({ windowMs: 15*60*1000, max: 10,  message: { error: 'Too many login attempts.' }, standardHeaders: true, legacyHeaders: false });
const adminLimiter = rateLimit({ windowMs:  1*60*1000, max: 120, standardHeaders: true, legacyHeaders: false });

// ── AUTH MIDDLEWARE ────────────────────────────────────────────────────────
function requireAuth(req, res, next) {
  const token = req.headers['x-session-token'] || req.query.token;
  if (!token || !getSession(token)) return res.status(401).json({ error: 'Unauthorized. Please log in.' });
  next();
}

// ── EMAIL HELPER ──────────────────────────────────────────────────────────
async function sendEmail({ to, subject, html, type = 'general', recipientName = '' }) {
  const logs = readJSON('emailLogs.json');
  const logEntry = {
    id        : `EL-${Date.now()}`,
    type,
    to,
    recipientName,
    subject,
    sentAt    : new Date().toISOString(),
    status    : 'sent',
    simulated : !transporter,
  };

  if (transporter) {
    try {
      await transporter.sendMail({ from: `"Kenya045 Media Hub" <${process.env.GMAIL_USER}>`, to, subject, html });
    } catch (err) {
      logEntry.status = 'failed';
      logEntry.error  = err.message;
      console.error('Email send error:', err.message);
    }
  } else {
    console.log(`\n📧 [SIMULATED EMAIL]\nTo: ${to}\nSubject: ${subject}\n---\n(HTML body omitted)\n`);
  }

  logs.push(logEntry);
  writeJSON('emailLogs.json', logs);
  return logEntry;
}

// ── EMAIL TEMPLATES ───────────────────────────────────────────────────────
const brand = `
  <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;background:#0f0f0f;color:#f5f0e8;border-radius:10px;overflow:hidden;">
  <div style="background:#c9922a;padding:24px 32px;text-align:center;">
    <h1 style="margin:0;font-size:22px;color:#080808;letter-spacing:2px;">KENYA045 MEDIA HUB</h1>
    <p style="margin:4px 0 0;font-size:12px;color:#3a2000;letter-spacing:1px;">PHOTOGRAPHY · VIDEOGRAPHY · DRONE</p>
  </div>`;
const brandClose = `
  <div style="background:#161616;padding:20px 32px;text-align:center;border-top:1px solid #333;">
    <p style="margin:0;font-size:12px;color:#888;">📞 0748 144 066 &nbsp;|&nbsp; ✉️ kenya045mediahub@gmail.com</p>
    <p style="margin:6px 0 0;font-size:11px;color:#555;">© ${new Date().getFullYear()} Kenya045 Media Hub. All rights reserved.</p>
  </div></div>`;

function tplBookingAck(b) {
  return `${brand}
  <div style="padding:32px;">
    <h2 style="color:#c9922a;margin-top:0;">Booking Request Received! 🎉</h2>
    <p>Hi <strong>${b.fullName}</strong>,</p>
    <p>Thank you for choosing Kenya045 Media Hub. We've received your booking request and will confirm availability within <strong>24 hours</strong>.</p>
    <table style="width:100%;border-collapse:collapse;margin:20px 0;">
      ${[['Booking ID',b.id],['Event Type',b.eventType],['Event Date',b.eventDate],['County',b.county],['Venue',b.venue]]
        .map(([k,v])=>`<tr><td style="padding:8px 12px;background:#1c1c1c;color:#c9922a;font-size:13px;width:40%;">${k}</td><td style="padding:8px 12px;background:#161616;font-size:13px;">${v}</td></tr>`).join('')}
    </table>
    <p>We'll reach you at <strong>${b.phone}</strong> or reply to this email.</p>
    <a href="https://wa.me/254748144066" style="display:inline-block;background:#c9922a;color:#080808;padding:12px 28px;border-radius:4px;text-decoration:none;font-weight:700;margin-top:8px;">WhatsApp Us</a>
  </div>${brandClose}`;
}

function tplInquiryAck(inq) {
  return `${brand}
  <div style="padding:32px;">
    <h2 style="color:#c9922a;margin-top:0;">Enquiry Received ✅</h2>
    <p>Hi <strong>${inq.name}</strong>,</p>
    <p>Thanks for reaching out! We've received your enquiry about <strong>${inq.subject}</strong> and will reply within <strong>24 hours</strong>.</p>
    <div style="background:#1c1c1c;border-left:3px solid #c9922a;padding:16px 20px;margin:20px 0;border-radius:4px;">
      <p style="margin:0;font-size:13px;color:#aaa;">${inq.message}</p>
    </div>
    <p>Reference: <strong style="color:#c9922a;">${inq.id}</strong></p>
  </div>${brandClose}`;
}

function tplBookingConfirm(b, customMsg) {
  return `${brand}
  <div style="padding:32px;">
    <h2 style="color:#c9922a;margin-top:0;">Your Booking is Confirmed! 📅</h2>
    <p>Hi <strong>${b.fullName}</strong>,</p>
    <p>Great news — we've confirmed availability for your event. We're excited to work with you!</p>
    ${customMsg ? `<div style="background:#1c1c1c;border-left:3px solid #c9922a;padding:16px 20px;margin:20px 0;border-radius:4px;"><p style="margin:0;">${customMsg}</p></div>` : ''}
    <table style="width:100%;border-collapse:collapse;margin:20px 0;">
      ${[['Booking ID',b.id],['Event',b.eventType],['Date',b.eventDate],['Venue',b.venue],['County',b.county]]
        .map(([k,v])=>`<tr><td style="padding:8px 12px;background:#1c1c1c;color:#c9922a;font-size:13px;width:40%;">${k}</td><td style="padding:8px 12px;background:#161616;font-size:13px;">${v}</td></tr>`).join('')}
    </table>
    <p><strong>Next step:</strong> A 30% deposit is required to fully secure your date. Pay via M-Pesa or bank transfer and reply with confirmation.</p>
    <a href="https://wa.me/254748144066" style="display:inline-block;background:#c9922a;color:#080808;padding:12px 28px;border-radius:4px;text-decoration:none;font-weight:700;margin-top:8px;">Confirm via WhatsApp</a>
  </div>${brandClose}`;
}

function tplCustomMessage(b, message, newStatus) {
  return `${brand}
  <div style="padding:32px;">
    <h2 style="color:#c9922a;margin-top:0;">Update on Your Booking</h2>
    <p>Hi <strong>${b.fullName}</strong>, (Ref: <strong>${b.id}</strong>)</p>
    ${newStatus ? `<p>Status update: <strong style="color:#c9922a;">${newStatus.toUpperCase()}</strong></p>` : ''}
    <div style="background:#1c1c1c;border-left:3px solid #c9922a;padding:16px 20px;margin:20px 0;border-radius:4px;">
      <p style="margin:0;white-space:pre-wrap;">${message}</p>
    </div>
    <p>Questions? Call or WhatsApp us on <strong>0748 144 066</strong></p>
  </div>${brandClose}`;
}

function tplFilesReady(b, galleryLink, deliverables) {
  return `${brand}
  <div style="padding:32px;">
    <h2 style="color:#c9922a;margin-top:0;">Your Files Are Ready! 🎉📸</h2>
    <p>Hi <strong>${b.fullName}</strong>,</p>
    <p>Your photos/videos are ready for download. Thank you for choosing Kenya045 Media Hub!</p>
    ${deliverables ? `<ul style="color:#aaa;font-size:14px;">${deliverables.split('\n').map(d=>`<li>${d}</li>`).join('')}</ul>` : ''}
    ${galleryLink ? `<a href="${galleryLink}" style="display:inline-block;background:#c9922a;color:#080808;padding:14px 32px;border-radius:4px;text-decoration:none;font-weight:700;font-size:15px;margin:16px 0;">View Your Gallery →</a>` : ''}
    <p style="font-size:13px;color:#888;">Link expires in 30 days. Download and save your files.</p>
  </div>${brandClose}`;
}

function tplInquiryReply(inq, replyText) {
  return `${brand}
  <div style="padding:32px;">
    <h2 style="color:#c9922a;margin-top:0;">Reply to Your Enquiry</h2>
    <p>Hi <strong>${inq.name}</strong>,</p>
    <p>Thank you for your enquiry about <strong>${inq.subject}</strong>. Here is our response:</p>
    <div style="background:#1c1c1c;border-left:3px solid #c9922a;padding:16px 20px;margin:20px 0;border-radius:4px;">
      <p style="margin:0;white-space:pre-wrap;">${replyText}</p>
    </div>
    <a href="https://kenya-045-media-hub-website-production.up.railway.app/#booking" style="display:inline-block;background:#c9922a;color:#080808;padding:12px 28px;border-radius:4px;text-decoration:none;font-weight:700;margin-top:8px;">Book a Session →</a>
  </div>${brandClose}`;
}

// ─────────────────────────────────────────────────────────────────────────
// PUBLIC API ROUTES
// ─────────────────────────────────────────────────────────────────────────

// Health check
app.get('/api/health', (_req, res) => {
  res.json({
    status   : 'ok',
    service  : 'Kenya045 Media Hub v2.0',
    uptime   : Math.round(process.uptime()),
    bookings : readJSON('bookings.json').length,
    inquiries: readJSON('inquiries.json').length,
    email    : transporter ? 'configured' : 'simulated',
    timestamp: new Date().toISOString(),
  });
});

// POST /api/booking
app.post('/api/booking', formLimiter, async (req, res) => {
  const { fullName, email, phone, eventDate, eventType, county, venue, additional } = req.body;
  const required = { fullName, email, phone, eventDate, eventType, county, venue };
  const missing  = Object.entries(required).filter(([,v]) => !v || !String(v).trim()).map(([k]) => k);
  if (missing.length) return res.status(400).json({ error: `Missing required fields: ${missing.join(', ')}` });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ error: 'Invalid email address' });

  const booking = {
    id          : `BK-${Date.now()}`,
    fullName    : String(fullName).trim(),
    email       : String(email).trim().toLowerCase(),
    phone       : String(phone).trim(),
    eventDate   : String(eventDate).trim(),
    eventType   : String(eventType).trim(),
    county      : String(county).trim(),
    venue       : String(venue).trim(),
    additional  : String(additional || '').trim(),
    submittedAt : new Date().toISOString(),
    status      : 'pending',
    notes       : '',
  };

  const bookings = readJSON('bookings.json');
  bookings.push(booking);
  writeJSON('bookings.json', bookings);
  console.log(`📅 New booking: ${booking.id} — ${booking.fullName} (${booking.eventType})`);

  // Auto-acknowledgement email
  await sendEmail({ to: booking.email, subject: `Booking Received — ${booking.id} | Kenya045 Media Hub`, html: tplBookingAck(booking), type: 'booking-ack', recipientName: booking.fullName });

  res.status(201).json({ success: true, message: 'Booking request received. We will contact you within 24 hours.', id: booking.id });
});

// POST /api/inquiry
app.post('/api/inquiry', formLimiter, async (req, res) => {
  const { inqName, inqEmail, inqPhone, inqSubject, inqMessage } = req.body;
  if (!inqName || !inqEmail || !inqSubject || !inqMessage) return res.status(400).json({ error: 'Please fill in all required fields.' });

  const inquiry = {
    id          : `IQ-${Date.now()}`,
    name        : String(inqName).trim(),
    email       : String(inqEmail).trim().toLowerCase(),
    phone       : String(inqPhone || '').trim(),
    subject     : String(inqSubject).trim(),
    message     : String(inqMessage).trim(),
    submittedAt : new Date().toISOString(),
    status      : 'new',
    notes       : '',
  };

  const inquiries = readJSON('inquiries.json');
  inquiries.push(inquiry);
  writeJSON('inquiries.json', inquiries);
  console.log(`✉️  New inquiry: ${inquiry.id} — ${inquiry.name} (${inquiry.subject})`);

  await sendEmail({ to: inquiry.email, subject: `Enquiry Received — ${inquiry.id} | Kenya045 Media Hub`, html: tplInquiryAck(inquiry), type: 'inquiry-ack', recipientName: inquiry.name });

  res.status(201).json({ success: true, message: 'Enquiry received. We will reply within 24 hours.', id: inquiry.id });
});

// ─────────────────────────────────────────────────────────────────────────
// AUTH ROUTES
// ─────────────────────────────────────────────────────────────────────────

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
  if (token) destroySession(token);
  res.json({ success: true });
});

app.get('/api/auth/verify', (req, res) => {
  const token = req.headers['x-session-token'] || req.query.token;
  const s = token ? getSession(token) : null;
  if (!s) return res.status(401).json({ valid: false });
  res.json({ valid: true, username: s.username });
});

// ─────────────────────────────────────────────────────────────────────────
// ADMIN — DATA ROUTES
// ─────────────────────────────────────────────────────────────────────────

// Stats dashboard
app.get('/api/stats', requireAuth, adminLimiter, (_req, res) => {
  const bookings  = readJSON('bookings.json');
  const inquiries = readJSON('inquiries.json');
  const emailLogs = readJSON('emailLogs.json');

  const bStatus = bookings.reduce((a, b) => { a[b.status] = (a[b.status] || 0) + 1; return a; }, {});
  const recent  = [...bookings.map(b => ({ ...b, _type: 'booking' })), ...inquiries.map(i => ({ ...i, _type: 'inquiry' }))]
    .sort((a, b) => new Date(b.submittedAt) - new Date(a.submittedAt)).slice(0, 10);

  res.json({
    bookings : { total: bookings.length, ...bStatus },
    inquiries: { total: inquiries.length, new: inquiries.filter(i => i.status === 'new').length },
    emails   : { total: emailLogs.length, sent: emailLogs.filter(e => e.status === 'sent').length },
    recent,
  });
});

// GET bookings
app.get('/api/bookings', requireAuth, adminLimiter, (req, res) => {
  let data = readJSON('bookings.json');
  const { search, status, sort = 'newest', page = 1, limit = 20 } = req.query;
  if (search) { const q = search.toLowerCase(); data = data.filter(b => b.fullName.toLowerCase().includes(q) || b.email.includes(q) || b.county.toLowerCase().includes(q) || b.eventType.toLowerCase().includes(q)); }
  if (status) data = data.filter(b => b.status === status);
  if (sort === 'newest') data.sort((a, b) => new Date(b.submittedAt) - new Date(a.submittedAt));
  else if (sort === 'oldest') data.sort((a, b) => new Date(a.submittedAt) - new Date(b.submittedAt));
  const total = data.length;
  const start = (parseInt(page) - 1) * parseInt(limit);
  data = data.slice(start, start + parseInt(limit));
  res.json({ total, page: parseInt(page), limit: parseInt(limit), bookings: data });
});

// GET single booking
app.get('/api/bookings/:id', requireAuth, adminLimiter, (req, res) => {
  const b = readJSON('bookings.json').find(b => b.id === req.params.id);
  if (!b) return res.status(404).json({ error: 'Booking not found' });
  res.json(b);
});

// PATCH booking
app.patch('/api/bookings/:id', requireAuth, adminLimiter, (req, res) => {
  const bookings = readJSON('bookings.json');
  const idx = bookings.findIndex(b => b.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Booking not found' });
  const allowed = ['status', 'notes'];
  allowed.forEach(f => { if (req.body[f] !== undefined) bookings[idx][f] = req.body[f]; });
  bookings[idx].updatedAt = new Date().toISOString();
  writeJSON('bookings.json', bookings);
  res.json(bookings[idx]);
});

// DELETE booking
app.delete('/api/bookings/:id', requireAuth, adminLimiter, (req, res) => {
  let bookings = readJSON('bookings.json');
  const exists = bookings.some(b => b.id === req.params.id);
  if (!exists) return res.status(404).json({ error: 'Booking not found' });
  bookings = bookings.filter(b => b.id !== req.params.id);
  writeJSON('bookings.json', bookings);
  res.json({ success: true });
});

// GET inquiries
app.get('/api/inquiries', requireAuth, adminLimiter, (req, res) => {
  let data = readJSON('inquiries.json');
  const { search, status, page = 1, limit = 20 } = req.query;
  if (search) { const q = search.toLowerCase(); data = data.filter(i => i.name.toLowerCase().includes(q) || i.email.includes(q) || i.subject.toLowerCase().includes(q)); }
  if (status) data = data.filter(i => i.status === status);
  data.sort((a, b) => new Date(b.submittedAt) - new Date(a.submittedAt));
  const total = data.length;
  const start = (parseInt(page) - 1) * parseInt(limit);
  data = data.slice(start, start + parseInt(limit));
  res.json({ total, page: parseInt(page), limit: parseInt(limit), inquiries: data });
});

// GET single inquiry
app.get('/api/inquiries/:id', requireAuth, adminLimiter, (req, res) => {
  const i = readJSON('inquiries.json').find(i => i.id === req.params.id);
  if (!i) return res.status(404).json({ error: 'Inquiry not found' });
  res.json(i);
});

// PATCH inquiry
app.patch('/api/inquiries/:id', requireAuth, adminLimiter, (req, res) => {
  const inquiries = readJSON('inquiries.json');
  const idx = inquiries.findIndex(i => i.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Inquiry not found' });
  const allowed = ['status', 'notes'];
  allowed.forEach(f => { if (req.body[f] !== undefined) inquiries[idx][f] = req.body[f]; });
  inquiries[idx].updatedAt = new Date().toISOString();
  writeJSON('inquiries.json', inquiries);
  res.json(inquiries[idx]);
});

// DELETE inquiry
app.delete('/api/inquiries/:id', requireAuth, adminLimiter, (req, res) => {
  let inquiries = readJSON('inquiries.json');
  const exists = inquiries.some(i => i.id === req.params.id);
  if (!exists) return res.status(404).json({ error: 'Inquiry not found' });
  inquiries = inquiries.filter(i => i.id !== req.params.id);
  writeJSON('inquiries.json', inquiries);
  res.json({ success: true });
});

// ─────────────────────────────────────────────────────────────────────────
// ADMIN — EMAIL ROUTES
// ─────────────────────────────────────────────────────────────────────────

// Confirm availability
app.post('/api/bookings/:id/confirm', requireAuth, adminLimiter, async (req, res) => {
  const bookings = readJSON('bookings.json');
  const idx = bookings.findIndex(b => b.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Booking not found' });
  const b = bookings[idx];
  bookings[idx].status = 'confirmed';
  bookings[idx].updatedAt = new Date().toISOString();
  writeJSON('bookings.json', bookings);
  const log = await sendEmail({ to: b.email, subject: `Booking Confirmed — ${b.id} | Kenya045 Media Hub`, html: tplBookingConfirm(b, req.body.message || ''), type: 'booking-confirm', recipientName: b.fullName });
  res.json({ success: true, booking: bookings[idx], emailLog: log });
});

// Send custom message to booking client
app.post('/api/bookings/:id/message', requireAuth, adminLimiter, async (req, res) => {
  const { message, newStatus } = req.body;
  if (!message) return res.status(400).json({ error: 'Message is required' });
  const bookings = readJSON('bookings.json');
  const idx = bookings.findIndex(b => b.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Booking not found' });
  const b = bookings[idx];
  if (newStatus) { bookings[idx].status = newStatus; bookings[idx].updatedAt = new Date().toISOString(); writeJSON('bookings.json', bookings); }
  const log = await sendEmail({ to: b.email, subject: `Update on Your Booking ${b.id} | Kenya045 Media Hub`, html: tplCustomMessage(b, message, newStatus), type: 'booking-message', recipientName: b.fullName });
  res.json({ success: true, emailLog: log });
});

// Send files/gallery ready
app.post('/api/bookings/:id/feedback', requireAuth, adminLimiter, async (req, res) => {
  const { galleryLink, deliverables } = req.body;
  const bookings = readJSON('bookings.json');
  const idx = bookings.findIndex(b => b.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Booking not found' });
  const b = bookings[idx];
  bookings[idx].status = 'delivered';
  bookings[idx].updatedAt = new Date().toISOString();
  writeJSON('bookings.json', bookings);
  const log = await sendEmail({ to: b.email, subject: `Your Files Are Ready! 📸 | Kenya045 Media Hub`, html: tplFilesReady(b, galleryLink, deliverables), type: 'files-ready', recipientName: b.fullName });
  res.json({ success: true, emailLog: log });
});

// Reply to inquiry
app.post('/api/inquiries/:id/reply', requireAuth, adminLimiter, async (req, res) => {
  const { replyText, newStatus } = req.body;
  if (!replyText) return res.status(400).json({ error: 'Reply text is required' });
  const inquiries = readJSON('inquiries.json');
  const idx = inquiries.findIndex(i => i.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Inquiry not found' });
  const inq = inquiries[idx];
  inquiries[idx].status = newStatus || 'replied';
  inquiries[idx].updatedAt = new Date().toISOString();
  writeJSON('inquiries.json', inquiries);
  const log = await sendEmail({ to: inq.email, subject: `Re: ${inq.subject} | Kenya045 Media Hub`, html: tplInquiryReply(inq, replyText), type: 'inquiry-reply', recipientName: inq.name });
  res.json({ success: true, emailLog: log });
});

// Broadcast email
app.post('/api/email/broadcast', requireAuth, adminLimiter, async (req, res) => {
  const { audience, subject, message } = req.body;
  if (!audience || !subject || !message) return res.status(400).json({ error: 'audience, subject and message are required' });

  const bookings  = readJSON('bookings.json');
  const inquiries = readJSON('inquiries.json');
  let recipients  = [];

  if (audience === 'all-clients')          recipients = [...bookings, ...inquiries.map(i => ({ ...i, fullName: i.name }))];
  else if (audience === 'pending')         recipients = bookings.filter(b => b.status === 'pending');
  else if (audience === 'confirmed')       recipients = bookings.filter(b => b.status === 'confirmed');
  else if (audience === 'new-inquiries')   recipients = inquiries.filter(i => i.status === 'new');

  // Deduplicate by email
  const seen = new Set();
  recipients = recipients.filter(r => { const e = r.email; if (seen.has(e)) return false; seen.add(e); return true; });

  const html = `${brand}<div style="padding:32px;"><p>Hi there,</p><div style="background:#1c1c1c;border-left:3px solid #c9922a;padding:16px 20px;margin:20px 0;border-radius:4px;white-space:pre-wrap;">${message}</div></div>${brandClose}`;

  const results = [];
  for (const r of recipients) {
    const log = await sendEmail({ to: r.email, subject, html, type: 'broadcast', recipientName: r.fullName || r.name || '' });
    results.push(log);
  }
  res.json({ success: true, sent: results.length, results });
});

// Email logs
app.get('/api/email/logs', requireAuth, adminLimiter, (req, res) => {
  let logs = readJSON('emailLogs.json');
  const { page = 1, limit = 30 } = req.query;
  logs.sort((a, b) => new Date(b.sentAt) - new Date(a.sentAt));
  const total = logs.length;
  const start = (parseInt(page) - 1) * parseInt(limit);
  logs = logs.slice(start, start + parseInt(limit));
  res.json({ total, page: parseInt(page), limit: parseInt(limit), logs });
});

// ─────────────────────────────────────────────────────────────────────────
// STATIC FILES + SPA
// ─────────────────────────────────────────────────────────────────────────
// Serve from public/ if it exists, otherwise root (handles Railway build variations)
const publicDir = fs.existsSync(path.join(__dirname, 'public', 'index.html'))
  ? path.join(__dirname, 'public')
  : __dirname;

app.use(express.static(publicDir, { maxAge: '1d', etag: true, index: false }));

// Also serve admin.html at /admin
app.get('/admin', (_req, res) => {
  const adminPath = fs.existsSync(path.join(__dirname, 'public', 'admin.html'))
    ? path.join(__dirname, 'public', 'admin.html')
    : path.join(__dirname, 'admin.html');
  res.sendFile(adminPath);
});

app.get('*', (_req, res) => {
  const indexPath = fs.existsSync(path.join(__dirname, 'public', 'index.html'))
    ? path.join(__dirname, 'public', 'index.html')
    : path.join(__dirname, 'index.html');
  res.sendFile(indexPath);
});

// ── ERROR HANDLER ─────────────────────────────────────────────────────────
app.use((err, _req, res, _next) => {
  console.error('Server error:', err.message);
  res.status(err.status || 500).json({ error: 'Internal server error' });
});

// ── START ─────────────────────────────────────────────────────────────────
app.listen(PORT, '0.0.0.0', () => {
  console.log(`\n🎬 Kenya045 Media Hub v2.0 — port ${PORT}`);
  console.log(` http://localhost:${PORT}`);
  console.log(` Health : http://localhost:${PORT}/api/health`);
  console.log(` Admin  : http://localhost:${PORT}/admin\n`);
});

module.exports = app;
