require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');

const app = express();

// ===================== MIDDLEWARE =====================
// CORS — local dev এ সব allow, production এ same-origin (Render serve করে)
const allowedOrigins = [
  'http://localhost:5000',
  'http://127.0.0.1:5000',
  'http://localhost:3000',
];
app.use(cors({
  origin: function (origin, callback) {
    // Render production এ origin undefined থাকে (same-origin request)
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true
}));

app.use(express.json({ limit: '10mb' }));

// Static frontend serve (production এ Render থেকে)
app.use(express.static(path.join(__dirname, '../frontend')));

// ===================== MONGODB CONNECTION =====================
const MONGODB_URI = process.env.MONGODB_URI;

if (!MONGODB_URI) {
  console.error('❌ MONGODB_URI environment variable not set!');
  console.error('   .env file এ MONGODB_URI দিন অথবা Render dashboard এ Environment Variable সেট করুন।');
  process.exit(1);
}

mongoose.connect(MONGODB_URI, {
  serverSelectionTimeoutMS: 10000, // 10 seconds timeout
  socketTimeoutMS: 45000,
})
  .then(() => console.log('✅ MongoDB Connected Successfully!'))
  .catch(err => {
    console.error('❌ MongoDB Connection Error:', err.message);
    process.exit(1);
  });

// Connection events
mongoose.connection.on('disconnected', () => console.warn('⚠️  MongoDB Disconnected'));
mongoose.connection.on('reconnected', () => console.log('🔄 MongoDB Reconnected'));

// ===================== MONGOOSE SCHEMAS =====================

// Topic Record Schema
const topicSchema = new mongoose.Schema({
  id: { type: Number, required: true, unique: true },
  date: { type: String, required: true },
  originDate: { type: String },
  completionDate: { type: String, default: null },
  category: { type: String, required: true },
  subject: { type: String, required: true },
  topicName: { type: String, required: true },
  noteUrl: { type: String, default: null },
  status: { type: String, enum: ['Pending', 'Complete'], default: 'Pending' },
  reviewsDone: { type: [String], default: [] },
  reviewHistoryStamps: { type: mongoose.Schema.Types.Mixed, default: {} },
  customRevPendingOn: { type: String, default: null },
  customReviewHistoryDates: { type: [String], default: [] }
}, { timestamps: true });

// Routine Schema (weekly schedule)
const routineSchema = new mongoose.Schema({
  userId: { type: String, default: 'default' },
  routine: { type: mongoose.Schema.Types.Mixed, required: true }
}, { timestamps: true });

const Topic = mongoose.model('Topic', topicSchema);
const Routine = mongoose.model('Routine', routineSchema);

// ===================== HELPER =====================
async function getAllTopicsGrouped() {
  const allTopics = await Topic.find({}).lean();
  const grouped = {};
  allTopics.forEach(t => {
    const { _id, __v, createdAt, updatedAt, ...cleanTopic } = t;
    if (!grouped[cleanTopic.date]) grouped[cleanTopic.date] = [];
    grouped[cleanTopic.date].push(cleanTopic);
  });
  return grouped;
}

// ===================== ROUTES: TOPICS =====================

// GET /api/topics — সব topics grouped by date
app.get('/api/topics', async (req, res) => {
  try {
    const grouped = await getAllTopicsGrouped();
    res.json({ success: true, data: grouped });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/topics — নতুন topic add
app.post('/api/topics', async (req, res) => {
  try {
    const topicData = req.body;
    const topic = new Topic(topicData);
    await topic.save();
    const grouped = await getAllTopicsGrouped();
    res.json({ success: true, data: grouped });
  } catch (err) {
    if (err.code === 11000) {
      // duplicate id হলে নতুন id দিয়ে try করো
      try {
        const topicData = { ...req.body, id: Date.now() + Math.floor(Math.random() * 1000) };
        const topic = new Topic(topicData);
        await topic.save();
        const grouped = await getAllTopicsGrouped();
        res.json({ success: true, data: grouped });
      } catch (e) {
        res.status(500).json({ success: false, error: e.message });
      }
    } else {
      res.status(500).json({ success: false, error: err.message });
    }
  }
});

// PUT /api/topics/:id — topic update (complete, shift date, etc.)
app.put('/api/topics/:id', async (req, res) => {
  try {
    const topicId = parseInt(req.params.id);
    await Topic.findOneAndUpdate({ id: topicId }, req.body, { new: true });
    const grouped = await getAllTopicsGrouped();
    res.json({ success: true, data: grouped });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// DELETE /api/topics/:id — topic delete (purge)
app.delete('/api/topics/:id', async (req, res) => {
  try {
    const topicId = parseInt(req.params.id);
    await Topic.findOneAndDelete({ id: topicId });
    const grouped = await getAllTopicsGrouped();
    res.json({ success: true, data: grouped });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/topics/bulk — পুরো dbTopics object একসাথে sync (migration এর জন্য)
app.post('/api/topics/bulk', async (req, res) => {
  try {
    const dbTopics = req.body; // { "date": [topics], ... }
    const allTopics = [];
    Object.keys(dbTopics).forEach(dateStr => {
      dbTopics[dateStr].forEach(t => allTopics.push(t));
    });

    // Upsert করো প্রতিটা topic
    for (const topic of allTopics) {
      await Topic.findOneAndUpdate(
        { id: topic.id },
        topic,
        { upsert: true, new: true }
      );
    }

    const grouped = await getAllTopicsGrouped();
    res.json({ success: true, data: grouped, message: `${allTopics.length} topics synced!` });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ===================== ROUTES: ROUTINE =====================

const defaultRoutine = {
  "Saturday": [["AI Engineering – L2", "JavaScript", "Typing Practice"], ["Structure–II", "R.C.C–II"], ["Geography", "English"], ["English Speaking"], ["QGIS"], ["Machine Learning"]],
  "Sunday": [["AI Engineering – L2", "JavaScript", "Typing Practice"], ["Structure–II", "R.C.C–II"], [], ["English Speaking"], ["QGIS"], ["Machine Learning"]],
  "Monday": [["AI Engineering – L2", "JavaScript", "Typing Practice"], ["Geotech–II", "Steel Structure"], ["Geography", "English"], ["Basic English"], ["SAP 2000"], ["Machine Learning"]],
  "Tuesday": [["AI Engineering – L2", "JavaScript", "Typing Practice"], ["Geotech–II", "Steel Structure"], [], ["Basic English"], ["SAP 2000"], ["Machine Learning"]],
  "Wednesday": [["AI Engineering – L2", "JavaScript", "Typing Practice"], ["Transportation", "Earth Quake Engineering", "Structure–I"], ["Geography", "English"], ["Freehand Writing"], ["Excel"], ["Research Class"]],
  "Thursday": [["AI Engineering – L2", "JavaScript", "Typing Practice"], ["Transportation", "Earth Quake Engineering", "Structure–I"], [], ["Freehand Writing"], ["Excel"], ["Research Class"]],
  "Friday": [[], [], ["Geography", "English"], [], [], []]
};

// GET /api/routine
app.get('/api/routine', async (req, res) => {
  try {
    let routineDoc = await Routine.findOne({ userId: 'default' }).lean();
    if (!routineDoc) {
      res.json({ success: true, data: defaultRoutine });
    } else {
      res.json({ success: true, data: routineDoc.routine });
    }
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// PUT /api/routine — routine update
app.put('/api/routine', async (req, res) => {
  try {
    const routineData = req.body;
    await Routine.findOneAndUpdate(
      { userId: 'default' },
      { userId: 'default', routine: routineData },
      { upsert: true, new: true }
    );
    res.json({ success: true, data: routineData });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ===================== HEALTH CHECK (Render ping এর জন্য) =====================
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    mongodb: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
    uptime: process.uptime()
  });
});

// ===================== CATCH ALL: Serve frontend =====================
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/index.html'));
});

// ===================== START SERVER =====================
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
  console.log(`📁 Serving frontend from: ${path.join(__dirname, '../frontend')}`);
});
