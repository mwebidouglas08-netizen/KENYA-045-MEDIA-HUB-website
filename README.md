# 🎬 Kenya045 Media Hub — Website

Professional photography, videography & drone services website for Kenya045 Media Hub. Covers all 47 counties in Kenya.

**Live contact:**
- 📞 0748 144 066
- ✉️ kenya045mediahub@gmail.com

---

## Features

- Cinematic dark photography theme with custom cursor
- Services: Photography, Videography, Drone
- Booking form (full name, email, phone, event date, event type, county, venue, additional info)
- FAQ / Inquiry section
- Pricing packages
- Portfolio gallery with filter
- All 47 Kenya counties in booking form + animated marquee
- Animated counters, scroll reveal effects
- Fully responsive (mobile-first)
- REST API for booking & inquiry submissions

---

## Quick Start (Local)

```bash
npm install
npm start
# Open http://localhost:3000
```

---

## Deploy to Railway

### Step 1 — GitHub

```bash
git init
git add .
git commit -m "Initial commit"
git remote add origin https://github.com/YOUR_USERNAME/kenya045-website.git
git branch -M main
git push -u origin main
```

### Step 2 — Railway

1. Go to [railway.app](https://railway.app) → sign in with GitHub
2. Click **New Project → Deploy from GitHub Repo**
3. Select `kenya045-website`
4. Railway auto-detects Node.js — click **Deploy**
5. Wait ~2 minutes for the build
6. Click **Generate Domain** for your public URL

No environment variables are required for the site to run.

### Optional env vars (Railway → Variables tab)

```
PORT=3000          # set automatically by Railway
ADMIN_KEY=yourkey  # protects /api/bookings and /api/inquiries endpoints
```

---

## API Endpoints

| Method | URL | Description |
|--------|-----|-------------|
| GET | `/api/health` | Health check |
| POST | `/api/booking` | Submit booking form |
| POST | `/api/inquiry` | Submit inquiry |
| GET | `/api/bookings?key=...` | View all bookings (admin) |
| GET | `/api/inquiries?key=...` | View all inquiries (admin) |

---

## File Structure

```
kenya045-website/
├── src/
│   └── server.js       # Express API
├── public/
│   └── index.html      # Full single-page website
├── package.json
├── railway.json
├── nixpacks.toml
├── .gitignore
└── README.md
```
