const express = require('express');
const router = express.Router();
const GameSession = require('./model/GameSession');
const ExcelJS = require('exceljs');
const moment = require('moment');

// POST endpoint for creating game sessions
router.post('/', async (req, res) => {
  try {
    // 1. Safely access request body
    const body = req.body || {};
    
    // 2. Validate presence of required fields
    const requiredFields = ['mapPlayed', 'gameDuration', 'teams', 'numberOfPlayers'];
    const missingFields = requiredFields.filter(field => !(field in body));

    if (missingFields.length > 0) {
      return res.status(400).json({
        success: false,
        error: `Missing required fields: ${missingFields.join(', ')}`
      });
    }

    // 3. Destructure after validation
    const { mapPlayed, gameDuration, teams, numberOfPlayers } = body;

    // 4. Validate teams structure
    if (!Array.isArray(teams)) {
      throw new Error('Teams must be an array');
    }
    
    if (teams.length < 2) {
      throw new Error('At least 2 teams required');
    }
    
    // 5. Validate individual team structure
    teams.forEach((team, index) => {
      if (!team || typeof team !== 'object') {
        throw new Error(`Team ${index + 1} must be an object`);
      }
      
      if (!team.name || typeof team.name !== 'string') {
        throw new Error(`Team ${index + 1} must have a string 'name' property`);
      }
    });
    
    // 6. Validate data types
    if (typeof gameDuration !== 'number' || gameDuration <= 0) {
      throw new Error('gameDuration must be a positive number');
    }
    
    if (typeof numberOfPlayers !== 'number' || numberOfPlayers <= 0) {
      throw new Error('numberOfPlayers must be a positive number');
    }
    
    // 7. Create session object
    const sessionData = {
      mapPlayed,
      gameDuration,
      numberOfPlayers,
      teams: teams.map(team => ({
        name: team.name,
        score: team.score || 0
      }))
    };
    
    // 8. Create and save session
    const newSession = new GameSession(sessionData);
    const savedSession = await newSession.save();
    
    // 9. Return success response
    res.status(201).json({
      success: true,
      message: 'Game session created successfully',
      session: savedSession
    });
    
  } catch (err) {
    // Handle errors
    console.error('Error creating session:', err);
    res.status(400).json({
      success: false,
      error: err.message
    });
  }
});

// GET all game sessions (simplified)
router.get('/', async (req, res) => {
  try {
    const sessions = await GameSession.find().sort({ createdAt: -1 });
    res.json({
      success: true,
      count: sessions.length,
      sessions
    });
  } catch (err) {
    console.error('Error fetching sessions:', err);
    res.status(500).json({
      success: false,
      error: 'Server error'
    });
  }
});

// GET session statistics (simplified)
router.get('/stats', async (req, res) => {
  try {
    const stats = await GameSession.aggregate([
      {
        $group: {
          _id: null,
          totalSessions: { $sum: 1 },
          avgDuration: { $avg: "$gameDuration" },
          totalPlayers: { $sum: "$numberOfPlayers" },
          maps: { $push: "$mapPlayed" }
        }
      },
      {
        $project: {
          _id: 0,
          totalSessions: 1,
          avgDuration: { $round: ["$avgDuration", 1] },
          totalPlayers: 1,
          maps: 1
        }
      }
    ]);

    // Calculate map frequency
    const mapCounts = {};
    if (stats[0]?.maps) {
      stats[0].maps.forEach(map => {
        mapCounts[map] = (mapCounts[map] || 0) + 1;
      });
    }

    res.json({
      success: true,
      stats: {
        ...(stats[0] || {}),
        mapDistribution: mapCounts
      }
    });
  } catch (err) {
    console.error('Error fetching stats:', err);
    res.status(500).json({
      success: false,
      error: 'Server error'
    });
  }
});

// GET test endpoint
router.get('/test', (req, res) => {
  res.json({
    success: true,
    message: 'GameSession endpoints are ready',
    endpoints: {
      createSession: {
        method: 'POST',
        path: '/',
        requiredFields: ['mapPlayed', 'gameDuration', 'teams', 'numberOfPlayers']
      },
      listSessions: {
        method: 'GET',
        path: '/'
      },
      getStats: {
        method: 'GET',
        path: '/stats'
      }
    }
  });
});


router.get('/export-test', async (req, res) => {
  try {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Test');
    worksheet.addRow(['Hello', 'World']);
    
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename=test.xlsx');
    
    await workbook.xlsx.write(res);
    res.end();
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


router.get('/export-excel', async (req, res) => {
  try {
    // 1. Get sessions (ensure variable name matches)
    const sessions = await GameSession.find().sort({ createdAt: -1 });
    
    if (!sessions || sessions.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'No sessions found for export'
      });
    }

    // 2. Create workbook
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Game Sessions');
    
    // 3. Define columns
    worksheet.columns = [
      { header: 'Created At', key: 'createdAt', width: 20 },
      { header: 'Map Played', key: 'map', width: 15 },
      { header: 'Duration (min)', key: 'duration', width: 15 },
      { header: 'Player Count', key: 'players', width: 15 },
      { header: 'Team Count', key: 'teamCount', width: 15 },
      { header: 'Teams & Scores', key: 'teams', width: 40 }
    ];

    // 4. Add rows
    sessions.forEach(session => {
      const teamInfo = session.teams.map(team => 
        `${team.name}: ${team.score}`).join('\n');
      
      worksheet.addRow({
        createdAt: moment(session.createdAt).format('YYYY-MM-DD HH:mm:ss'),
        map: session.mapPlayed,
        duration: session.gameDuration,
        players: session.numberOfPlayers,
        teamCount: session.teams.length,
        teams: teamInfo
      });
    });

    // 5. Set headers and send
    res.setHeader('Content-Type', 
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 
      'attachment; filename=game_sessions.xlsx');

    await workbook.xlsx.write(res);
    res.end();
    
  } catch (err) {
    console.error('Excel export error:', err);
    
    // Return detailed error
    res.status(500).json({
      success: false,
      error: 'Failed to generate Excel file',
      details: err.message,
      stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
    });
  }
});


router.get('/export-detailed-excel', async (req, res) => {
  try {
    const sessions = await GameSession.find().sort({ createdAt: -1 }).lean();
    
    if (!sessions.length) {
      return res.status(404).json({ success: false, error: 'No sessions found' });
    }

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Game Sessions');
    
    // Define columns
    worksheet.columns = [
      { header: 'Session ID', key: 'id', width: 25 },
      { header: 'Created At', key: 'createdAt', width: 20 },
      { header: 'Map', key: 'map', width: 15 },
      { header: 'Duration (min)', key: 'duration', width: 15 },
      { header: 'Players', key: 'players', width: 10 },
      { header: 'Teams', key: 'teams', width: 40 },
      { header: 'Avg. Score', key: 'avgScore', width: 12 },
      { header: 'Highest Score', key: 'maxScore', width: 12 }
    ];

    // Add data rows with team information
    sessions.forEach(session => {
      const teamInfo = session.teams.map(team => 
        `${team.name}: ${team.score}`).join('\n');
      
      // Calculate stats
      const scores = session.teams.map(t => t.score);
      const avgScore = scores.reduce((a, b) => a + b, 0) / scores.length;
      const maxScore = Math.max(...scores);
      
      worksheet.addRow({
        id: session._id.toString(),
        createdAt: moment(session.createdAt).format('YYYY-MM-DD HH:mm:ss'),
        map: session.mapPlayed,
        duration: session.gameDuration,
        players: session.numberOfPlayers,
        teams: teamInfo,
        avgScore: avgScore.toFixed(2),
        maxScore
      });
    });

    // Style header row
    worksheet.getRow(1).eachCell(cell => {
      cell.font = { bold: true };
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFD9E1F2' }
      };
    });

    // Set response headers
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename=game_sessions_detailed.xlsx');

    await workbook.xlsx.write(res);
    res.end();
    
  } catch (err) {
    console.error('Detailed session export error:', err);
    res.status(500).json({
      success: false,
      error: 'Failed to generate detailed Excel file'
    });
  }
});

// Map analytics report
router.get('/export-map-analytics-excel', async (req, res) => {
  try {
    console.log('Starting map analytics export...');
    
    // 1. Fetch data from MongoDB
    const mapStats = await GameSession.aggregate([
      {
        $group: {
          _id: '$mapPlayed',
          totalSessions: { $sum: 1 },
          avgDuration: { $avg: '$gameDuration' },
          totalPlayers: { $sum: '$numberOfPlayers' },
          avgPlayers: { $avg: '$numberOfPlayers' },
          avgTeams: { $avg: { $size: '$teams' } },
          totalScore: { $sum: { $sum: '$teams.score' } },
          avgScore: { $avg: { $avg: '$teams.score' } }
        }
      },
      { $sort: { totalSessions: -1 } }
    ]);

    console.log(`Fetched ${mapStats.length} map stats records`);
    
    if (!mapStats.length) {
      console.warn('No map data found for export');
      return res.status(404).json({ 
        success: false, 
        error: 'No map data found' 
      });
    }

    // 2. Create workbook
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'ArenaVR Analytics';
    workbook.created = new Date();
    
    // 3. Add worksheet
    const worksheet = workbook.addWorksheet('Map Analytics');
    
    // Define columns
    worksheet.columns = [
      { header: 'Map', key: 'map', width: 15 },
      { header: 'Total Sessions', key: 'sessions', width: 15 },
      { header: 'Avg. Duration (min)', key: 'avgDuration', width: 20 },
      { header: 'Total Players', key: 'totalPlayers', width: 15 },
      { header: 'Avg. Players/Session', key: 'avgPlayers', width: 20 },
      { header: 'Avg. Teams/Session', key: 'avgTeams', width: 20 },
      { header: 'Total Score', key: 'totalScore', width: 15 },
      { header: 'Avg. Score/Team', key: 'avgScore', width: 20 }
    ];

    // Add data rows with safe value handling
    mapStats.forEach(stat => {
      try {
        worksheet.addRow({
          map: stat._id || 'Unknown',
          sessions: stat.totalSessions || 0,
          avgDuration: (stat.avgDuration || 0).toFixed(1),
          totalPlayers: stat.totalPlayers || 0,
          avgPlayers: (stat.avgPlayers || 0).toFixed(1),
          avgTeams: (stat.avgTeams || 0).toFixed(1),
          totalScore: stat.totalScore || 0,
          avgScore: (stat.avgScore || 0).toFixed(1)
        });
      } catch (rowError) {
        console.error('Error adding row:', rowError);
        console.error('Problematic stat:', JSON.stringify(stat, null, 2));
      }
    });

    console.log('Added data rows to worksheet');
    
    // 4. Add chart (wrap in try-catch as this might be failing)
    try {
      const chartSheet = workbook.addWorksheet('Charts');
      const barChart = {
        type: 'bar',
        title: 'Map Popularity',
        data: {
          categories: mapStats.map(s => s._id || 'Unknown'),
          values: mapStats.map(s => s.totalSessions || 0)
        }
      };
      chartSheet.addChart(barChart, 'A1');
      console.log('Added chart to workbook');
    } catch (chartError) {
      console.error('Chart creation failed:', chartError);
      // Continue without chart
    }

    // 5. Style header row
    try {
      worksheet.getRow(1).eachCell(cell => {
        cell.font = { bold: true };
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FFD9E1F2' } // Light blue
        };
        cell.border = {
          top: { style: 'thin' },
          left: { style: 'thin' },
          bottom: { style: 'thin' },
          right: { style: 'thin' }
        };
      });
      console.log('Styled header row');
    } catch (styleError) {
      console.error('Header styling failed:', styleError);
    }

    // 6. Set response headers
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename=map_analytics_report.xlsx');

    console.log('Writing Excel to response...');
    
    // 7. Send response
    await workbook.xlsx.write(res);
    console.log('Excel file sent successfully');
    
    // End the response
    res.end();
    
  } catch (err) {
    console.error('Map analytics export error:', err);
    
    // Detailed error response
    const errorResponse = {
      success: false,
      error: 'Failed to generate map analytics Excel',
      message: err.message,
      ...(process.env.NODE_ENV === 'development' && {
        stack: err.stack,
        hint: 'Check MongoDB aggregation or ExcelJS version'
      })
    };
    
    // Only send response if headers haven't been sent
    if (!res.headersSent) {
      res.status(500).json(errorResponse);
    } else {
      console.error('Headers already sent, could not return error response');
    }
  }
});
// Daily summary report
router.get('/export-daily-summary-excel', async (req, res) => {
  try {
    const dailyStats = await GameSession.aggregate([
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
          totalSessions: { $sum: 1 },
          totalPlayers: { $sum: '$numberOfPlayers' },
          totalDuration: { $sum: '$gameDuration' },
          avgDuration: { $avg: '$gameDuration' },
          uniqueMaps: { $addToSet: '$mapPlayed' }
        }
      },
      { 
        $project: {
          date: '$_id',
          totalSessions: 1,
          totalPlayers: 1,
          totalDuration: 1,
          avgDuration: 1,
          uniqueMapsCount: { $size: '$uniqueMaps' }
        }
      },
      { $sort: { date: -1 } }
    ]);

    if (!dailyStats.length) {
      return res.status(404).json({ success: false, error: 'No daily data found' });
    }

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Daily Summary');
    
    // Define columns
    worksheet.columns = [
      { header: 'Date', key: 'date', width: 12 },
      { header: 'Sessions', key: 'sessions', width: 12 },
      { header: 'Players', key: 'players', width: 12 },
      { header: 'Total Duration', key: 'totalDuration', width: 15 },
      { header: 'Avg. Duration', key: 'avgDuration', width: 15 },
      { header: 'Unique Maps', key: 'uniqueMaps', width: 15 },
      { header: 'Players/Session', key: 'playersPerSession', width: 18 }
    ];

    // Add data rows with calculated metrics
    dailyStats.forEach(stat => {
      const playersPerSession = stat.totalPlayers / stat.totalSessions;
      
      worksheet.addRow({
        date: stat.date,
        sessions: stat.totalSessions,
        players: stat.totalPlayers,
        totalDuration: stat.totalDuration,
        avgDuration: stat.avgDuration.toFixed(1),
        uniqueMaps: stat.uniqueMapsCount,
        playersPerSession: playersPerSession.toFixed(1)
      });
    });

    // Add summary formulas
    worksheet.addRow([]); // Empty row
    worksheet.addRow({
      date: 'TOTALS',
      sessions: { formula: `SUM(B2:B${dailyStats.length + 1})` },
      players: { formula: `SUM(C2:C${dailyStats.length + 1})` },
      totalDuration: { formula: `SUM(D2:D${dailyStats.length + 1})` }
    });

    // Style header row
    worksheet.getRow(1).eachCell(cell => {
      cell.font = { bold: true };
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFD9E1F2' }
      };
    });

    // Style totals row
    const totalsRow = worksheet.getRow(dailyStats.length + 3);
    totalsRow.font = { bold: true };
    totalsRow.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFFCE4D6' }
    };

    // Set response headers
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename=daily_summary_report.xlsx');

    await workbook.xlsx.write(res);
    res.end();
    
  } catch (err) {
    console.error('Daily summary export error:', err);
    res.status(500).json({
      success: false,
      error: 'Failed to generate daily summary Excel'
    });
  }
});




module.exports = router;