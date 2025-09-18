const mongoose = require('mongoose');
const moment = require('moment');

const gameSessionSchema = new mongoose.Schema({
  mapPlayed: {
    type: String,
    required: [true, 'Map selection is required'],
    enum: {
      values: ['Desert', 'Forest', 'Urban', 'Snow', 'Factory'],
      message: 'Invalid map selection'
    },
    index: true
  },
  gameDuration: {
    type: Number,
    required: [true, 'Game duration is required'],
    min: [1, 'Duration must be at least 1 minute'],
    max: [120, 'Duration cannot exceed 120 minutes']
  },
  numberOfPlayers: {
    type: Number,
    required: [true, 'Player count is required'],
    min: [2, 'Minimum 2 players required'],
    max: [32, 'Maximum 32 players allowed']
  },
  teams: [{
    name: {
      type: String,
      required: [true, 'Team name is required'],
      trim: true,
      maxlength: [30, 'Team name too long (max 30 chars)']
    },
    players: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: 'PlayersContact',
      validate: {
        validator: async function(playerId) {
          const player = await mongoose.model('PlayersContact').findById(playerId);
          return !!player;
        },
        message: 'Invalid player reference'
      }
    }],
    score: {
      type: Number,
      default: 0,
      min: 0
    }
  }]
}, {
  timestamps: { 
    createdAt: true, // Keep creation timestamp
    updatedAt: false // Disable updatedAt
  },
  toJSON: {
    virtuals: true,
    transform: function(doc, ret) {
      delete ret.__v;
      delete ret._id;
      
      // Format creation date only
      ret.createdAt = moment(ret.createdAt).format('YYYY-MM-DD HH:mm:ss');
      
      return ret;
    }
  }
});

// Validation: Player count matches team assignments
gameSessionSchema.pre('save', function(next) {
  const totalPlayers = this.teams.reduce(
    (sum, team) => sum + team.players.length, 0);
  
  if (totalPlayers !== this.numberOfPlayers) {
    this.invalidate('numberOfPlayers', 
      `Player count (${totalPlayers}) doesn't match team assignments (${this.numberOfPlayers})`
    );
  }
  
  next();
});

// Virtual for game session duration in hours
gameSessionSchema.virtual('durationHours').get(function() {
  return (this.gameDuration / 60).toFixed(1);
});

// Indexes
gameSessionSchema.index({ createdAt: -1 }); // Newest sessions first
gameSessionSchema.index({ mapPlayed: 1 }); // Filter by map

module.exports = mongoose.model('GameSession', gameSessionSchema);