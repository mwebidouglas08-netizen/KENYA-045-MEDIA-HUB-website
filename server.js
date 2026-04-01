'use strict';
const express = require('express');
const path = require('path');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const app = express();
const PORT = process.env.PORT || 3000;
// ── SECURITY & PERF ───────────────────────────────────────────────────────
app.use(helmet({
 contentSecurityPolicy: {
 directives: {
 defaultSrc: ["'self'"],
 styleSrc: ["'self'", "'unsafe-inline'", 'fonts.googleapis.com'],
 fontSrc: ["'self'", 'fonts.gstatic.com'],
 imgSrc: ["'self'", 'data:', 'https:'],
 scriptSrc: ["'self'", "'unsafe-inline'"],
 connectSrc: ["'self'"],
 },
 },
}));
app.use(compression());
app.use(cors());
app.use(express.json({ limit: '200kb' }));
app.use(express.urlencoded({ extended: true }));
// Rate limiting for form endpoints
const formLimiter = rateLimit({
 windowMs: 15 * 60 * 1000,
 max: 15,
 message: { error: 'Too many requests. Please try again later.' },
 standardHeaders: true,
 legacyHeaders: false,
});
// ── IN-MEMORY STORE (replace with DB in production) ───────────────────────
const bookings = [];
const inquiries = [];
// ── API ROUTES ─────────────────────────────────────────────────────────────
// Health check (Railway uses this)
app.get('/api/health', (_req, res) => {
 res.json({
 status: 'ok',
 service: 'Kenya045 Media Hub',
 uptime: Math.round(process.uptime()),
 bookings: bookings.length,
 inquiries: inquiries.length,
 timestamp: new Date().toISOString(),
 });
});
// POST /api/booking
app.post('/api/booking', formLimiter, (req, res) => {
 const {
 fullName, email, phone, eventDate,
 eventType, county, venue, additional,
 } = req.body;
 // Basic validation
 const required = { fullName, email, phone, eventDate, eventType, county, venue };
 const missing = Object.entries(required)
 .filter(([, v]) => !v || !String(v).trim())
 .map(([k]) => k);
 if (missing.length) {
 return res.status(400).json({ error: `Missing required fields: ${missing.join(', ')}` });
 }
 // Email format check
 if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
 return res.status(400).json({ error: 'Invalid email address' });
 }
 const booking = {
 id: `BK-${Date.now()}`,
 fullName: String(fullName).trim(),
 email: String(email).trim().toLowerCase(),
 phone: String(phone).trim(),
 eventDate: String(eventDate).trim(),
 eventType: String(eventType).trim(),
 county: String(county).trim(),
 venue: String(venue).trim(),
 additional: String(additional || '').trim(),
 submittedAt: new Date().toISOString(),
 status: 'pending',
 };
 bookings.push(booking);
 console.log(`📅 New booking: ${booking.id} — ${booking.fullName} (${booking.eventType}) on ${booking.eventDate}`);
 // In production, send email notification here via Nodemailer/SendGrid
 res.status(201).json({
 success: true,
 message: 'Booking request received. We will contact you within 24 hours.',
 id: booking.id,
 });
});
// POST /api/inquiry
app.post('/api/inquiry', formLimiter, (req, res) => {
 const { inqName, inqEmail, inqPhone, inqSubject, inqMessage } = req.body;
 if (!inqName || !inqEmail || !inqSubject || !inqMessage) {
 return res.status(400).json({ error: 'Please fill in all required fields.' });
 }
 const inquiry = {
 id: `IQ-${Date.now()}`,
 name: String(inqName).trim(),
 email: String(inqEmail).trim().toLowerCase(),
 phone: String(inqPhone || '').trim(),
 subject: String(inqSubject).trim(),
 message: String(inqMessage).trim(),
 submittedAt: new Date().toISOString(),
 status: 'new',
 };
 inquiries.push(inquiry);
 console.log(`✉️ New inquiry: ${inquiry.id} — ${inquiry.name} (${inquiry.subject})`);
 res.status(201).json({
 success: true,
 message: 'Enquiry received. We will reply within 24 hours.',
 id: inquiry.id,
 });
});
// GET /api/bookings (admin — protect with auth in production)
app.get('/api/bookings', (req, res) => {
 const key = req.query.key || req.headers['x-admin-key'];
 if (key !== (process.env.ADMIN_KEY || 'kenya045admin')) {
 return res.status(401).json({ error: 'Unauthorized' });
 }
 res.json({ total: bookings.length, bookings });
});
// GET /api/inquiries (admin)
app.get('/api/inquiries', (req, res) => {
 const key = req.query.key || req.headers['x-admin-key'];
 if (key !== (process.env.ADMIN_KEY || 'kenya045admin')) {
 return res.status(401).json({ error: 'Unauthorized' });
 }
 res.json({ total: inquiries.length, inquiries });
});
// ── STATIC FILES ──────────────────────────────────────────────────────────
app.use(express.static(path.join(__dirname, 'public'), {
 maxAge: '1d',
 etag: true,
 index: false,
}));
// Serve frontend for all other routes (SPA fallback)
app.get('*', (_req, res) => {
 res.sendFile(path.join(__dirname, 'public', 'index.html'));
});
// ── ERROR HANDLER ─────────────────────────────────────────────────────────
app.use((err, _req, res, _next) => {
 console.error('Server error:', err.message);
 res.status(err.status || 500).json({ error: 'Internal server error' });
});
// ── START ─────────────────────────────────────────────────────────────────
app.listen(PORT, '0.0.0.0', () => {
 console.log(`\n🎬 Kenya045 Media Hub — running on port ${PORT}`);
 console.log(` http://localhost:${PORT}`);
 console.log(` Health: http://localhost:${PORT}/api/health\n`);
});
module.exports = app;
