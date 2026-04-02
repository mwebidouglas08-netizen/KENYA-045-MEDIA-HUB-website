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
