require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');

const app = express();

// ===================== MIDDLEWARE =====================
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// Static frontend serve (production এ)
app.use(express.static(path.join(__dirname, '../frontend')));

// ===================== MONGODB CONNECTION =====================
mongoose.connect(process.env.MONGODB_URI)
  .then(() => console.log('✅ MongoDB Connected Successfully!'))
  .catch(err => console.error('❌ MongoDB Connection Error:', err));

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
// dbTopics format: { "2024-01-01": [topic, topic], ... }
// DB তে flat store করা হয় topic গুলো, API response এ grouped করা হয়

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

// GET /api/routine
app.get('/api/routine', async (req, res) => {
  try {
    let routineDoc = await Routine.findOne({ userId: 'default' }).lean();
    if (!routineDoc) {
      // Default routine return করো
      const defaultRoutine = {
        "Saturday": [["AI Engineering – L2", "JavaScript", "Typing Practice"], ["Structure–II", "R.C.C–II"], ["Geography", "English"], ["English Speaking"], ["QGIS"], ["Machine Learning"]],
        "Sunday": [["AI Engineering – L2", "JavaScript", "Typing Practice"], ["Structure–II", "R.C.C–II"], [], ["English Speaking"], ["QGIS"], ["Machine Learning"]],
        "Monday": [["AI Engineering – L2", "JavaScript", "Typing Practice"], ["Geotech–II", "Steel Structure"], ["Geography", "English"], ["Basic English"], ["SAP 2000"], ["Machine Learning"]],
        "Tuesday": [["AI Engineering – L2", "JavaScript", "Typing Practice"], ["Geotech–II", "Steel Structure"], [], ["Basic English"], ["SAP 2000"], ["Machine Learning"]],
        "Wednesday": [["AI Engineering – L2", "JavaScript", "Typing Practice"], ["Transportation", "Earth Quake Engineering", "Structure–I"], ["Geography", "English"], ["Freehand Writing"], ["Excel"], ["Research Class"]],
        "Thursday": [["AI Engineering – L2", "JavaScript", "Typing Practice"], ["Transportation", "Earth Quake Engineering", "Structure–I"], [], ["Freehand Writing"], ["Excel"], ["Research Class"]],
        "Friday": [[], [], ["Geography", "English"], [], [], []]
      };
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

// ===================== CATCH ALL: Serve frontend =====================
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/index.html'));
});

// ===================== START SERVER =====================
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});
