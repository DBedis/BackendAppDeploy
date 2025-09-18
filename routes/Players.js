const mongoose = require('mongoose');
const Player = mongoose.model('PlayersContact');
const Team = mongoose.model('TeamsDetails');
const PDFDocument = require('pdfkit');
const path = require('path');
const moment = require('moment');
const ExcelJS = require('exceljs');

// Helper functions
const handleServerError = (res, err, context) => {
  console.error(`${context} Error:`, err);
  if (!res.headersSent) {
    res.status(500).json({ 
      code: 500, 
      msg: 'Internal Server Error',
      error: err.message 
    });
  }
};

const validateRequiredFields = (fields, req, res) => {
  for (const field of fields) {
    if (!req.body[field]) {
      res.status(400).json({ 
        code: 1, 
        msg: `Missing required field: ${field}` 
      });
      return false;
    }
  }
  return true;
};

// PDF Generation Helpers
const addWatermark = (doc) => {
  const watermarkPath = path.join(__dirname, '../assets/landlogo.png');
  const wmWidth = 500;
  const wmX = (doc.page.width - wmWidth) / 2;
  const wmY = (doc.page.height - wmWidth) / 2;
  
  doc.save()
    .opacity(0.1)
    .image(watermarkPath, wmX, wmY, { width: wmWidth })
    .restore();
};


const addLogo = (doc) => {
  const logoPath = path.join(__dirname, '../assets/levelonelogo.png');
  doc.image(logoPath, doc.page.width - 80, 20, { width: 60 });
};

const generateTable = (doc, headers, colWidths, data, startY, rowHeight = 20) => {
  let y = startY;
  
  // Draw headers
  doc.font('Helvetica-Bold').fontSize(9);
  let x = 50;
  headers.forEach((header, i) => {
    doc.text(header, x, y);
    x += colWidths[i];
  });

  // Draw rows
  doc.font('Helvetica').fontSize(8);
  data.forEach(row => {
    y += rowHeight;
    x = 50;
    
    if (y > 700) {
      doc.addPage();
      y = 50;
    }

    row.forEach((text, i) => {
      doc.text(text || 'N/A', x, y, {
        width: colWidths[i],
        ellipsis: true
      });
      x += colWidths[i];
    });
  });

  return y;
};

module.exports = app => {

  // Player Reports
  app.get('/players/export-pdf', async (req, res) => {
    try {
      const players = await Player.find().sort({ createdAt: -1 }).lean();
      
      if (!players.length) {
        return res.status(404).json({ code: 1, msg: 'No players found' });
      }

      const doc = new PDFDocument({ margin: 50, size: 'A4' });
      res.set({
        'Content-Type': 'application/pdf',
        'Content-Disposition': 'attachment; filename=players_report.pdf'
      });

      doc.pipe(res);
      doc.fontSize(20).text('Liste des joueurs', { align: 'center' });
      doc.fontSize(12).text(`Généré le: ${moment().format('YYYY-MM-DD HH:mm')}`, { align: 'center' });
      doc.moveDown(2);

      const headers = ['Pseudo', 'Nom', 'Prénom', 'Email', 'Age', 'Télép', 'Région'];
      const colWidths = [50, 70, 100, 140, 25, 70, 50];
      
      const data = players.map(p => [
        p.nickname,
        p.name,
        p.lastname,
        p.email,
        p.age?.toString(),
        p.phone,
        p.region
      ]);

      generateTable(doc, headers, colWidths, data, doc.y);
      doc.end();
    } catch (err) {
      handleServerError(res, err, 'PDF Export');
    }
  });

 app.get('/players/export-basic-pdf', async (req, res) => {
    try {
      const players = await Player.find()
        .sort({ createdAt: -1 })
        .select('nickname email createdAt')
        .lean();

      if (!players.length) {
        return res.status(404).json({ code: 1, msg: 'No players found' });
      }

      const doc = new PDFDocument({ margin: 50, size: 'A4' });
      res.set({
        'Content-Type': 'application/pdf',
        'Content-Disposition': 'attachment; filename=players_basic_report.pdf'
      });

      doc.pipe(res);
      addLogo(doc);
      doc.fontSize(20).text('Liste des joueurs (Basic)', { align: 'center' });
      doc.fontSize(12).text(`Généré le: ${moment().format('YYYY-MM-DD HH:mm')}`, { align: 'center' });
      doc.moveDown(2);

      // Only change these two lines:
      const headers = ['Pseudo', 'Email', 'Date et heure']; // Updated column name
      const colWidths = [120, 220, 120]; // Adjusted widths for time display
      
      const data = players.map(p => [
        p.nickname || 'N/A',
        p.email || 'N/A',
        moment(p.createdAt).format('YYYY-MM-DD HH:mm') // Added time here
      ]);

      generateTable(doc, headers, colWidths, data, doc.y);
      doc.end();
    } catch (err) {
      handleServerError(res, err, 'Basic PDF Export');
    }
});

  app.get('/players/export-stats-pdf', async (req, res) => {
    try {
      const players = await Player.find()
        .sort({ createdAt: -1 })
        .select('nickname kills deaths')
        .lean();

      if (!players.length) {
        return res.status(404).json({ code: 1, msg: 'No players found' });
      }

      const doc = new PDFDocument({ margin: 50, size: 'A4' });
      res.set({
        'Content-Type': 'application/pdf',
        'Content-Disposition': 'attachment; filename=players_stats_report.pdf'
      });

      doc.pipe(res);
      addLogo(doc);
      addWatermark(doc);
      doc.fontSize(20).text('Statistiques des joueurs', { align: 'center' });
      doc.fontSize(12).text(`Généré le: ${moment().format('YYYY-MM-DD HH:mm')}`, { align: 'center' });
      doc.moveDown(2);

      const headers = ['Pseudo', 'Kills', 'Deaths', 'Score'];
      const colWidths = [120, 80, 80, 80];
      
      const data = players.map(p => {
        const kills = p.kills || 0;
        const deaths = p.deaths || 0;
        const score = deaths > 0 ? (kills / deaths).toFixed(2) : kills.toString();
        
        return [
          p.nickname,
          kills.toString(),
          deaths.toString(),
          score
        ];
      });

      generateTable(doc, headers, colWidths, data, doc.y);
      doc.end();
    } catch (err) {
      handleServerError(res, err, 'Stats PDF Export');
    }
  });

  // Team Management
  app.post('/teams/assign-nickname', async (req, res) => {
    const required = ['headsetId', 'nickname', 'TeamName'];
    if (!validateRequiredFields(required, req, res)) return;

    try {
      const { headsetId, nickname, TeamName } = req.body;
      const player = await Player.findOne({ nickname });

      if (!player) {
        return res.status(404).json({ code: 2, msg: 'Nickname not found' });
      }

      const teamAssignment = await Team.findOneAndUpdate(
        { headsetId },
        { headsetId, TeamName, nickname, lastUpdated: new Date() },
        { new: true, upsert: true, lean: true }
      );

      await Player.findByIdAndUpdate(player._id, { 
        headsetId,
        TeamName,
        lastUpdated: new Date() 
      });

      res.json({ 
        code: 0,
        data: {
          headsetId: teamAssignment.headsetId,
          TeamName: teamAssignment.TeamName,
          nickname: teamAssignment.nickname
        }
      });
    } catch (err) {
      handleServerError(res, err, 'Team Assignment');
    }
  });

  // Player Management
  app.post('/players/update-by-headset', async (req, res) => {
    const required = ['headsetId', 'nickname'];
    if (!validateRequiredFields(required, req, res)) return;

    try {
      const { headsetId, nickname } = req.body;
      const player = await Player.findOneAndUpdate(
        { headsetId },
        { nickname, lastUpdated: new Date() },
        { new: true, upsert: true }
      );

      res.json({ 
        success: true,
        data: {
          headsetId: player.headsetId,
          nickname: player.nickname
        }
      });
    } catch (err) {
      handleServerError(res, err, 'Headset Update');
    }
  });

  app.get('/players/by-headset/:headsetId', async (req, res) => {
    try {
      const player = await Player.findOne({ headsetId: req.params.headsetId }).lean();
      
      if (!player) {
        return res.status(404).json({ code: 1, msg: 'Player not found' });
      }

      res.json({ code: 0, data: player });
    } catch (err) {
      handleServerError(res, err, 'Get Player by Headset');
    }
  });

  app.post('/players/add', async (req, res) => {
    const required = ['nickname', 'name', 'lastname', 'email', 'age', 'phone', 'region'];
    if (!validateRequiredFields(required, req, res)) return;

    try {
      if (await Player.findOne({ nickname: req.body.nickname })) {
        return res.status(409).json({ code: 2, msg: 'Nickname already exists' });
      }

      const player = new Player(req.body);
      await player.save();
      res.status(201).json({ code: 0, data: player });
    } catch (err) {
      handleServerError(res, err, 'Add Player');
    }
  });

  app.get('/players', async (req, res) => {
    try {
      const players = await Player.find().sort({ createdAt: -1 }).lean();
      res.json({ code: 0, data: players });
    } catch (err) {
      handleServerError(res, err, 'Get Players');
    }
  });

  app.get('/teams', async (req, res) => {
    try {
      const teams = await Team.find().sort({ createdAt: -1 }).lean();
      res.json({ code: 0, data: teams });
    } catch (err) {
      handleServerError(res, err, 'Get Teams');
    }
  });

  app.get('/players/nicknames', async (req, res) => {
    try {
      const nicknames = await Player.find().distinct('nickname');
      res.json({ code: 0, data: nicknames });
    } catch (err) {
      handleServerError(res, err, 'Get Nicknames');
    }
  });

  app.get('/players/nickname/:nickname', async (req, res) => {
    try {
      const player = await Player.findOne({ nickname: req.params.nickname }).lean();
      
      if (!player) {
        return res.status(404).json({ code: 1, msg: 'Player not found' });
      }

      res.json({ code: 0, data: player });
    } catch (err) {
      handleServerError(res, err, 'Get Player by Nickname');
    }
  });

  // Stats Management
 const handleStatOperation = async (req, res, statName) => {
  try {
    const player = await Player.findOneAndUpdate(
      { nickname: req.params.nickname },
      { $inc: { [statName]: 1 } },
      { new: true, lean: true }
    ).select(statName);

    if (!player) {
      return res.status(404).json({ code: 1, msg: 'Player not found' });
    }

    res.json({ 
      code: 0, 
      [statName]: player[statName] || 0,
      msg: `${statName} incremented successfully`
    });
  } catch (err) {
    handleServerError(res, err, `${statName} Increment`);
  }
};

  app.post('/players/:nickname/increment-kills', (req, res) => 
  handleStatOperation(req, res, 'kills')
);

  app.get('/players/:nickname/deaths', async (req, res) => {
    try {
      const player = await Player.findOne(
        { nickname: req.params.nickname },
        { deaths: 1 }
      ).lean();

      if (!player) {
        return res.status(404).json({ code: 1, msg: 'Player not found' });
      }

      res.json({ code: 0, deaths: player.deaths || 0 });
    } catch (err) {
      handleServerError(res, err, 'Get Deaths');
    }
  });

  app.post('/players/:nickname/increment-deaths', (req, res) => 
  handleStatOperation(req, res, 'deaths')
);

  app.get('/players/:nickname/score', async (req, res) => {
    try {
      const player = await Player.findOne(
        { nickname: req.params.nickname },
        { kills: 1, deaths: 1 }
      ).lean();

      if (!player) {
        return res.status(404).json({ code: 1, msg: 'Player not found' });
      }

      const kills = player.kills || 0;
      const deaths = player.deaths || 0;
      const score = deaths > 0 ? (kills / deaths).toFixed(2) : kills;

      res.json({ code: 0, score: parseFloat(score) });
    } catch (err) {
      handleServerError(res, err, 'Get Score');
    }
  });

// Player Excel Exports
app.get('/players/export-excel', async (req, res) => {
  try {
    const players = await Player.find().sort({ createdAt: -1 }).lean();
    
    if (!players.length) {
      return res.status(404).json({ code: 1, msg: 'No players found' });
    }

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Players Master List');
    
    // Define columns
    worksheet.columns = [
      { header: 'ID', key: '_id', width: 25 },
      { header: 'Nickname', key: 'nickname', width: 20 },
      { header: 'Name', key: 'name', width: 15 },
      { header: 'Lastname', key: 'lastname', width: 15 },
      { header: 'Email', key: 'email', width: 25 },
      { header: 'Age', key: 'age', width: 8 },
      { header: 'Phone', key: 'phone', width: 15 },
      { header: 'Region', key: 'region', width: 15 },
      { header: 'Kills', key: 'kills', width: 8 },
      { header: 'Deaths', key: 'deaths', width: 8 },
      { header: 'Score', key: 'score', width: 10 },
      { header: 'Headset ID', key: 'headsetId', width: 20 },
      { header: 'Team', key: 'teamName', width: 20 },
      { header: 'Created At', key: 'createdAt', width: 20 },
      { header: 'Updated At', key: 'updatedAt', width: 20 }
    ];

    // Add data rows
    players.forEach(player => {
      worksheet.addRow({
        ...player,
        score: player.deaths > 0 ? (player.kills / player.deaths).toFixed(2) : player.kills,
        createdAt: moment(player.createdAt).format('YYYY-MM-DD HH:mm:ss'),
        updatedAt: moment(player.updatedAt).format('YYYY-MM-DD HH:mm:ss')
      });
    });

    // Style header row
    worksheet.getRow(1).eachCell(cell => {
      cell.font = { bold: true };
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFD9E1F2' }  // Light blue background
      };
      cell.border = {
        top: { style: 'thin' },
        left: { style: 'thin' },
        bottom: { style: 'thin' },
        right: { style: 'thin' }
      };
    });

    // Auto-fit columns
    worksheet.columns.forEach(column => {
      let maxLength = 0;
      column.eachCell({ includeEmpty: true }, cell => {
        const columnLength = cell.value ? cell.value.toString().length : 0;
        if (columnLength > maxLength) maxLength = columnLength;
      });
      column.width = Math.min(Math.max(maxLength + 2, 10), 50);
    });

    // Set response headers
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename=players_master_list.xlsx');

    await workbook.xlsx.write(res);
    res.end();
    
  } catch (err) {
    handleServerError(res, err, 'Player Excel Export');
  }
});

app.get('/players/export-performance-excel', async (req, res) => {
  try {
    const players = await Player.find().sort({ createdAt: -1 }).lean();
    
    if (!players.length) {
      return res.status(404).json({ code: 1, msg: 'No players found' });
    }

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Player Performance');
    
    // Define columns
    worksheet.columns = [
      { header: 'Nickname', key: 'nickname', width: 20 },
      { header: 'Total Kills', key: 'kills', width: 12 },
      { header: 'Total Deaths', key: 'deaths', width: 12 },
      { header: 'K/D Ratio', key: 'kdRatio', width: 12 },
      { header: 'Win Rate', key: 'winRate', width: 12 },
      { header: 'Performance Score', key: 'performance', width: 18 }
    ];

    // Add data rows with calculations
    players.forEach(player => {
      const kills = player.kills || 0;
      const deaths = player.deaths || 0;
      
      // Calculate K/D Ratio
      const kdRatio = deaths > 0 ? (kills / deaths).toFixed(2) : kills;
      
      // Simplified performance calculation
      const performance = Math.round(
        (kills * 2) - (deaths * 0.5) + (kdRatio * 10)
      );
      
      // Simplified win rate (placeholder calculation)
      const winRate = Math.min(100, Math.round((kills / (kills + deaths || 1)) * 100));
      
      worksheet.addRow({
        nickname: player.nickname,
        kills,
        deaths,
        kdRatio,
        winRate: `${winRate}%`,
        performance
      });
    });

    // Add conditional formatting for K/D Ratio
    worksheet.addConditionalFormatting({
      ref: 'D2:D1000', // K/D Ratio column
      rules: [
        {
          type: 'cellIs',
          operator: 'greaterThan',
          formulae: ['1.5'],
          style: { 
            fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFC6EFCE' } }, // Green
            font: { color: { argb: 'FF006100' }, bold: true }
          }
        },
        {
          type: 'cellIs',
          operator: 'lessThan',
          formulae: ['0.8'],
          style: { 
            fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFC7CE' } }, // Red
            font: { color: { argb: 'FF9C0006' }, bold: true }
          }
        }
      ]
    });

    // Style header row
    worksheet.getRow(1).eachCell(cell => {
      cell.font = { bold: true };
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFD9E1F2' }  // Light blue background
      };
      cell.border = {
        top: { style: 'thin' },
        left: { style: 'thin' },
        bottom: { style: 'thin' },
        right: { style: 'thin' }
      };
    });

    // Set response headers
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename=player_performance_report.xlsx');

    await workbook.xlsx.write(res);
    res.end();
    
  } catch (err) {
    handleServerError(res, err, 'Player Performance Export');
  }
});



  app.get('/players/by-date', async (req, res) => {
    try {
      const { from, to } = req.query;
      if (!from || !to) {
        return res.status(400).json({ code: 1, msg: 'Missing date range' });
      }

      const players = await Player.find({
        createdAt: {
          $gte: new Date(from),
          $lte: new Date(to + 'T23:59:59.999Z')
        }
      }).sort({ createdAt: -1 }).lean();

      res.json({ code: 0, data: players });
    } catch (err) {
      handleServerError(res, err, 'Get Players by Date');
    }
  });  
};