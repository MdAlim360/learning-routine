require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
const https = require('https');

const app = express();

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, '../frontend')));

const MONGODB_URI = process.env.MONGODB_URI;
if (!MONGODB_URI) {
  console.error('❌ MONGODB_URI environment variable not set!');
  process.exit(1);
}

mongoose.connect(MONGODB_URI, {
  serverSelectionTimeoutMS: 10000,
  socketTimeoutMS: 45000,
})
  .then(() => console.log('✅ MongoDB Connected Successfully!'))
  .catch(err => {
    console.error('❌ MongoDB Connection Error:', err.message);
    process.exit(1);
  });

mongoose.connection.on('disconnected', () => console.warn('⚠️  MongoDB Disconnected'));
mongoose.connection.on('reconnected', () => console.log('🔄 MongoDB Reconnected'));

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

const routineSchema = new mongoose.Schema({
  userId: { type: String, default: 'default' },
  routine: { type: mongoose.Schema.Types.Mixed, required: true }
}, { timestamps: true });

const kvSchema = new mongoose.Schema({
  userId: { type: String, default: 'default' },
  key:    { type: String, required: true },
  value:  { type: mongoose.Schema.Types.Mixed, required: true }
}, { timestamps: true });
kvSchema.index({ userId: 1, key: 1 }, { unique: true });

const Topic = mongoose.model('Topic', topicSchema);
const Routine = mongoose.model('Routine', routineSchema);
const KV = mongoose.model('KV', kvSchema);

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

app.get('/api/topics', async (req, res) => {
  try {
    const grouped = await getAllTopicsGrouped();
    res.json({ success: true, data: grouped });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/topics', async (req, res) => {
  try {
    const topicData = req.body;
    if (!topicData.id) topicData.id = Date.now() + Math.floor(Math.random() * 1000);
    const topic = new Topic(topicData);
    await topic.save();
    const grouped = await getAllTopicsGrouped();
    res.json({ success: true, data: grouped });
  } catch (err) {
    if (err.code === 11000) {
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

app.post('/api/topics/bulk', async (req, res) => {
  try {
    const dbTopics = req.body;
    const allTopics = [];
    Object.keys(dbTopics).forEach(dateStr => {
      dbTopics[dateStr].forEach(t => allTopics.push(t));
    });
    for (const topic of allTopics) {
      await Topic.findOneAndUpdate({ id: topic.id }, topic, { upsert: true, new: true });
    }
    const grouped = await getAllTopicsGrouped();
    res.json({ success: true, data: grouped, message: `${allTopics.length} topics synced!` });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

const defaultRoutine = {
  "Saturday": [["AI Engineering – L2", "JavaScript", "Typing Practice"], ["Structure–II", "R.C.C–II"], ["Geography", "English"], ["English Speaking"], ["QGIS"], ["Machine Learning"]],
  "Sunday": [["AI Engineering – L2", "JavaScript", "Typing Practice"], ["Structure–II", "R.C.C–II"], [], ["English Speaking"], ["QGIS"], ["Machine Learning"]],
  "Monday": [["AI Engineering – L2", "JavaScript", "Typing Practice"], ["Geotech–II", "Steel Structure"], ["Geography", "English"], ["Basic English"], ["SAP 2000"], ["Machine Learning"]],
  "Tuesday": [["AI Engineering – L2", "JavaScript", "Typing Practice"], ["Geotech–II", "Steel Structure"], [], ["Basic English"], ["SAP 2000"], ["Machine Learning"]],
  "Wednesday": [["AI Engineering – L2", "JavaScript", "Typing Practice"], ["Transportation", "Earth Quake Engineering", "Structure–I"], ["Geography", "English"], ["Freehand Writing"], ["Excel"], ["Research Class"]],
  "Thursday": [["AI Engineering – L2", "JavaScript", "Typing Practice"], ["Transportation", "Earth Quake Engineering", "Structure–I"], [], ["Freehand Writing"], ["Excel"], ["Research Class"]],
  "Friday": [[], [], ["Geography", "English"], [], [], []]
};

app.get('/api/routine', async (req, res) => {
  try {
    let routineDoc = await Routine.findOne({ userId: 'default' }).lean();
    res.json({ success: true, data: routineDoc ? routineDoc.routine : defaultRoutine });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

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

app.get('/api/kv/:key', async (req, res) => {
  try {
    const doc = await KV.findOne({ userId: 'default', key: req.params.key }).lean();
    res.json({ success: true, data: doc ? doc.value : null });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.put('/api/kv/:key', async (req, res) => {
  try {
    const val = req.body;
    await KV.findOneAndUpdate(
      { userId: 'default', key: req.params.key },
      { userId: 'default', key: req.params.key, value: val },
      { upsert: true, new: true }
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ===================== AI PROXY — Groq (ফ্রি + Fast!) =====================
// Anthropic format এ আসে, Groq/OpenAI format এ convert করে পাঠায়
app.post('/api/ai', (req, res) => {
  const GROQ_API_KEY = process.env.GROQ_API_KEY;
  if (!GROQ_API_KEY) {
    return res.status(500).json({ error: 'GROQ_API_KEY environment variable not set!' });
  }

  const { system, messages, max_tokens } = req.body;

  // Groq OpenAI-compatible format এ convert
  const groqMessages = [];
  if (system) groqMessages.push({ role: 'system', content: system });
  (messages || []).forEach(m => groqMessages.push({ role: m.role, content: m.content }));

  const groqBody = JSON.stringify({
    model: 'llama-3.3-70b-versatile',
    messages: groqMessages,
    max_tokens: max_tokens || 1000
  });

  const options = {
    hostname: 'api.groq.com',
    path: '/openai/v1/chat/completions',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + GROQ_API_KEY,
      'Content-Length': Buffer.byteLength(groqBody)
    }
  };

  const apiReq = https.request(options, (apiRes) => {
    let data = '';
    apiRes.on('data', chunk => data += chunk);
    apiRes.on('end', () => {
      try {
        const parsed = JSON.parse(data);
        // Groq response → Anthropic format এ convert করে frontend এ পাঠাও
        const text = parsed?.choices?.[0]?.message?.content || '';
        res.json({ content: [{ type: 'text', text }] });
      } catch (e) {
        res.status(500).json({ error: 'Invalid response from Groq', raw: data });
      }
    });
  });

  apiReq.on('error', (err) => {
    res.status(500).json({ error: err.message });
  });

  apiReq.write(groqBody);
  apiReq.end();
});

app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    mongodb: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
    uptime: process.uptime()
  });
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/index.html'));
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
  console.log(`📁 Serving frontend from: ${path.join(__dirname, '../frontend')}`);
});
