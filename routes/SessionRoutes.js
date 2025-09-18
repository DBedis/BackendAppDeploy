const express = require('express');
const router = express.Router();
const GameSession = require('../models/GameSession');
const Player = require('../models/PlayersContact');
const mongoose = require('mongoose');

// POST endpoint - Create game session with nicknames
router.post('/', async (req, res) => {
  try {
    // Validate required fields
    if (!req.body.teams || !Array.isArray(req.body.teams)) {
      return res.status(400).json({ error: 'Teams array is required' });
    }

    // Process teams to convert nicknames to player IDs
    const teamsWithPlayerIds = await Promise.all(
      req.body.teams.map(async (team) => {
        if (!team.players || !Array.isArray(team.players)) {
          throw new Error(`Each team must have a players array`);
        }

        const playerIds = await Promise.all(
          team.players.map(async (nickname) => {
            const player = await Player.findOne({ nickname });
            if (!player) {
              throw new Error(`Player not found: ${nickname}`);
            }
            return player._id;
          })
        );

        return {
          name: team.name || `Team ${Math.random().toString(36).substring(2, 5)}`,
          players: playerIds,
          score: team.score || 0,
          won: team.won || false
        };
      })
    );

    // Create new game session
    const newSession = new GameSession({
      mapPlayed: req.body.mapPlayed || 'Desert',
      gameDuration: req.body.gameDuration || 30,
      gameDate: req.body.gameDate || Date.now(),
      numberOfPlayers: req.body.numberOfPlayers || teamsWithPlayerIds.reduce((sum, team) => sum + team.players.length, 0),
      teams: teamsWithPlayerIds,
      winningTeam: req.body.winningTeam
    });

    const savedSession = await newSession.save();
    res.status(201).json({
      success: true,
      session: savedSession
    });

  } catch (err) {
    console.error('Error creating game session:', err);
    res.status(500).json({ 
      error: err.message,
      details: err.stack 
    });
  }
});

module.exports = (app) => {
  app.use('/api/game-sessions', router);
};