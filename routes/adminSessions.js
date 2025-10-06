// routes/adminSessions.js
const express       = require('express');
const GameSession   = require('../model/GameSession');
const { authenticateAdmin } = require('../middleware/auth');

const router = express.Router();

// Create a new session
// POST /api/admin/sessions
router.post('/', authenticateAdmin, async (req, res, next) => {
  try {
    const session = new GameSession(req.body);
    await session.save();
    res.status(201).json(session);
  } catch (err) {
    next(err);
  }
});

// Get sessions with filters & pagination
// GET /api/admin/sessions?from=&to=&map=&teamId=&page=&limit=
router.get('/', authenticateAdmin, async (req, res, next) => {
  try {
    const { from, to, map, teamId, page = 1, limit = 20 } = req.query;
    const filter = {};

    if (from || to) {
      filter.playedAt = {};
      if (from) filter.playedAt.$gte = new Date(from);
      if (to)   filter.playedAt.$lte = new Date(to);
    }
    if (map)    filter.mapPlayed = map;
    if (teamId) filter['teams.teamId'] = teamId;

    const total = await GameSession.countDocuments(filter);
    const sessions = await GameSession.find(filter)
      .sort({ playedAt: -1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit));

    res.json({ page, limit, total, sessions });
  } catch (err) {
    next(err);
  }
});

module.exports = router;