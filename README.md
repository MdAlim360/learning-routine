# 🚀 My Learning Routine — Live Deployment Guide

আপনার Personal Routine App কে যেকোনো device থেকে access করার জন্য নিচের steps follow করুন।

---

## 📁 Project Structure

```
routine-app/
├── backend/
│   ├── server.js          ← Express + MongoDB API server
│   ├── package.json
│   └── .env.example       ← Environment variables template
├── frontend/
│   └── index.html         ← আপনার পুরো app (API দিয়ে কাজ করে)
├── render.yaml            ← Render.com auto-deploy config
└── README.md
```

---

## STEP 1: MongoDB Atlas — Free Database Setup

1. **https://cloud.mongodb.com** এ যান → Sign Up (বিনামূল্যে)

2. **Create a Cluster:**
   - "Build a Database" → **Free (M0)** tier বেছে নিন
   - Provider: AWS, Region: যেকোনো (Singapore ভালো)
   - Cluster Name: `Cluster0`

3. **Database User তৈরি:**
   - Security → Database Access → Add New Database User
   - Username: `routineuser` (যা ইচ্ছা)
   - Password: একটা strong password (মনে রাখুন!)
   - Role: **Atlas Admin**

4. **Network Access:**
   - Security → Network Access → Add IP Address
   - **"Allow Access from Anywhere"** (0.0.0.0/0) বেছে নিন
   - ✅ Confirm

5. **Connection String নিন:**
   - Database → Connect → Connect your application
   - Driver: Node.js, Version: 5.5 or later
   - এরকম একটা string পাবেন:
   ```
   mongodb+srv://routineuser:YOUR_PASSWORD@cluster0.xxxxx.mongodb.net/?retryWrites=true&w=majority
   ```
   - শেষে `/?` এর আগে database name add করুন:
   ```
   mongodb+srv://routineuser:YOUR_PASSWORD@cluster0.xxxxx.mongodb.net/routine-app?retryWrites=true&w=majority
   ```

---

## STEP 2: GitHub — Code Upload

1. **https://github.com** এ Sign Up / Login

2. New Repository তৈরি করুন:
   - Name: `my-learning-routine`
   - **Public** রাখুন (Render free tier এর জন্য)

3. আপনার computer এ Git install করুন (থাকলে skip):
   - https://git-scm.com/downloads

4. Terminal/Command Prompt খুলুন:
   ```bash
   cd routine-app
   git init
   git add .
   git commit -m "Initial commit"
   git remote add origin https://github.com/YOUR_USERNAME/my-learning-routine.git
   git branch -M main
   git push -u origin main
   ```

---

## STEP 3: Render.com — Free Hosting Deploy

1. **https://render.com** এ Sign Up → **"Sign up with GitHub"** দিয়ে login করুন

2. Dashboard → **New** → **Web Service**

3. Repository select করুন: `my-learning-routine`

4. Settings:
   - **Name:** my-learning-routine
   - **Root Directory:** `backend`
   - **Runtime:** Node
   - **Build Command:** `npm install`
   - **Start Command:** `node server.js`
   - **Instance Type:** Free

5. **Environment Variables** এ click করুন → Add:
   - Key: `MONGODB_URI`
   - Value: আপনার MongoDB connection string (Step 1 থেকে)

6. **Create Web Service** → Deploy শুরু হবে (৩-৫ মিনিট)

7. Deploy শেষে আপনার link পাবেন:
   ```
   https://my-learning-routine.onrender.com
   ```

---

## STEP 4: পুরনো Data Migrate করুন (Optional)

আপনার browser এ আগের localStorage data থাকলে, প্রথমবার নতুন link open করলে **automatically migrate** হয়ে যাবে! কোনো extra কাজ লাগবে না।

---

## ⚠️ Render Free Tier Note

- Free tier এ server **15 মিনিট inactive** থাকলে "sleep" করে
- প্রথম request এ **30-60 সেকেন্ড** সময় লাগতে পারে (cold start)
- Data MongoDB তে থাকে, তাই সব সময় safe

**Tip:** Render এর "cron job" দিয়ে প্রতি 10 মিনিটে ping করলে sleep হবে না (free plan এ available)।

---

## 🔧 Local Development (নিজের computer এ চালানো)

```bash
# backend folder এ যান
cd routine-app/backend

# .env file তৈরি করুন
cp .env.example .env
# .env file এ আপনার MONGODB_URI দিন

# Dependencies install
npm install

# Server চালু করুন
npm run dev
```

তারপর browser এ: `http://localhost:5000`

---

## ❓ সমস্যা হলে

- MongoDB connection error → Network Access এ 0.0.0.0/0 দিয়েছেন কিনা দেখুন
- Render deploy fail → Build logs দেখুন, MONGODB_URI সঠিকভাবে দেওয়া আছে কিনা চেক করুন
