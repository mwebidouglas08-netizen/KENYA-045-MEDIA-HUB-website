# 🎬 Kenya045 Media Hub — v2.0 Full-Stack Website

Professional photography, videography & drone services platform with a complete admin command centre.

---

## 🔐 Admin Credentials

| Field        | Value |
|---|---|
| **Admin URL** | `https://kenya-045-media-hub-website-production.up.railway.app/admin` |
| **Username**  | `admin` |
| **Password**  | `K045@Admin2025!` |
| **API Key**   | `K045-ADMIN-SECRET-8f3a9d2e1b7c4f6a` |

> ⚠️ **Security**: Always set these as Railway environment variables — never commit real credentials.

---

## ✨ What's New in v2.0

### Admin Command Centre (`/admin`)

| Feature | Description |
|---|---|
| 🔐 Secure Login | Session-based auth, 8-hour expiry |
| 📊 Live Dashboard | Stats cards, recent activity, bar charts |
| 📅 Booking Management | View, search, filter, update status, add notes |
| ✉️ Inquiry Management | View messages, search, filter by status |
| ✅ Confirm Availability | One-click confirmation with branded email to client |
| 📨 Send Updates | Message any client individually — update their booking status at the same time |
| 📁 Send Files/Feedback | Notify clients files are ready, include gallery link and deliverables list |
| ↩️ Reply to Inquiries | Template replies (pricing, availability, custom) or compose your own |
| 📢 Broadcast Email | Send to: all pending bookings / confirmed bookings / all clients / new inquiries |
| 📋 Email Logs | Full history of every email sent, with type, recipient, status, timestamps |

### Email Features (via Nodemailer + Gmail)
- **Auto-acknowledgement**: Clients instantly get a confirmation email when they submit a booking or inquiry
- **Confirmation email**: Beautiful branded HTML email with full booking details, deposit info
- **Update emails**: Notify clients of status changes, schedule updates, reminders
- **Delivery notification**: Let clients know their photos/videos are ready with gallery link
- **Inquiry replies**: Professional replies with one-click booking CTA
- **Broadcast**: Bulk emails to filtered client groups
- **Simulated mode**: If email is not configured, all emails are logged to console (nothing crashes)

---

## 🗂 File Structure

```
kenya045-media-hub/
├── server.js           ← Express backend + all API + email routes
├── public/
│   ├── index.html      ← Full website (forms wired to real API)
│   └── admin.html      ← Admin Command Centre
├── data/               ← Auto-created on first run
│   ├── bookings.json
│   ├── inquiries.json
│   └── emailLogs.json
├── package.json        ← Includes nodemailer
├── railway.json
├── nixpacks.toml
├── .gitignore
└── README.md
```

---

## 🚀 Deploy to Railway

### Step 1 — Push to GitHub

```bash
# Replace all files in your existing repo with these new files, then:
git add .
git commit -m "v2.0 — full admin backend with email"
git push
```

Railway will auto-redeploy from the push.

### Step 2 — Set Environment Variables

In Railway → your project → **Variables** tab, add:

```
ADMIN_USERNAME=admin
ADMIN_PASSWORD=K045@Admin2025!
ADMIN_KEY=K045-ADMIN-SECRET-8f3a9d2e1b7c4f6a
SESSION_SECRET=pick-any-random-string-here
GMAIL_USER=kenya045mediahub@gmail.com
GMAIL_PASS=xxxx xxxx xxxx xxxx
```

> ⚠️ `GMAIL_PASS` must be a **Gmail App Password** (16 characters), NOT your Gmail login password.

---

## 📧 Setting Up Gmail for Emails

1. Go to [myaccount.google.com](https://myaccount.google.com)
2. **Security** → **2-Step Verification** → Turn ON
3. **Security** → **App passwords** → Select app: "Mail" → Select device: "Other" → type "Railway"
4. Copy the 16-character password (e.g. `abcd efgh ijkl mnop`)
5. Set `GMAIL_PASS=abcd efgh ijkl mnop` in Railway Variables

Without email configured, the system still works — all emails are **simulated** (logged to Railway console) and no errors occur.

---

## 🌐 API Reference

### Public
| Method | URL | Description |
|---|---|---|
| GET | `/api/health` | Health check + email status |
| POST | `/api/booking` | Submit booking (sends auto-ack email to client) |
| POST | `/api/inquiry` | Submit inquiry (sends auto-ack email to client) |

### Auth
| Method | URL | Description |
|---|---|---|
| POST | `/api/auth/login` | `{ username, password }` → returns session token |
| POST | `/api/auth/logout` | Invalidate session |
| GET | `/api/auth/verify` | Check token validity |

### Admin — Data (requires session token)
| Method | URL | Description |
|---|---|---|
| GET | `/api/stats` | Dashboard stats + recent activity |
| GET | `/api/bookings` | List (search, filter, sort, paginate) |
| GET | `/api/bookings/:id` | Single booking |
| PATCH | `/api/bookings/:id` | Update status / notes |
| DELETE | `/api/bookings/:id` | Delete booking |
| GET | `/api/inquiries` | List inquiries |
| GET | `/api/inquiries/:id` | Single inquiry |
| PATCH | `/api/inquiries/:id` | Update status / notes |
| DELETE | `/api/inquiries/:id` | Delete inquiry |

### Admin — Email (requires session token)
| Method | URL | Description |
|---|---|---|
| POST | `/api/bookings/:id/confirm` | Confirm availability + send branded email |
| POST | `/api/bookings/:id/message` | Send custom update to client |
| POST | `/api/bookings/:id/feedback` | Send file delivery notification |
| POST | `/api/inquiries/:id/reply` | Reply to an inquiry |
| POST | `/api/email/broadcast` | Bulk email to filtered group |
| GET | `/api/email/logs` | Paginated email history |

---

## 📞 Contact

- 📞 0748 144 066
- ✉️ kenya045mediahub@gmail.com
- 💬 [WhatsApp](https://wa.me/254748144066)
