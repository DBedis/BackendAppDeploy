const mongoose = require('mongoose');
const { Schema } = mongoose;

const playerSchema = new Schema({
  nickname: { 
    type: String, 
    required: true, 
    unique: true,
    trim: true,
    match: [/^[a-zA-Z0-9_]+$/, 'Nickname can only contain letters, numbers and underscores'],
    maxLength: [20, 'Nickname too long']
  },
  name: { 
    type: String, 
    required: true,
    trim: true,
    maxLength: 50
  },
  lastname: { 
    type: String, 
    required: true,
    trim: true,
    maxLength: 50 
  },
  email: { 
    type: String, 
    required: true,
    unique: true,
    trim: true,
    lowercase: true,
    validate: {
      validator: (v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v),
      message: 'Invalid email format'
    }
  },
  age: {
    type: Number,
    required: true,
    min: [13, 'Player must be at least 13 years old'],
    max: [100, 'Age must be reasonable']
  },
  phone: {
    type: String,
    required: true,
    validate: {
      validator: (v) => /^\d{8,15}$/.test(v),
      message: 'Phone must be 8-15 digits'
    }
  },
  region: {
    type: String,
    required: true,
    trim: true
    // No enum - directly from Unity
  },
  kills: {
    type: Number,
    default: 0,
    min: 0
  },
  deaths: {
    type: Number,
    default: 0,
    min: 0
  },
  headsetId: { 
    type: String,
    default: null
  },
  TeamName: {  // Added to match your route usage
    type: String,
    default: null
  }
}, {
  timestamps: true,
  toJSON: { 
    virtuals: true,
    transform: function(doc, ret) {
      delete ret.__v;
      // Add this transform to format both timestamps:
      ret.createdAt = moment(ret.createdAt).format('YYYY-MM-DD HH:mm:ss');
      ret.updatedAt = moment(ret.updatedAt).format('YYYY-MM-DD HH:mm:ss');
      return ret;
    }
  
  }
});

// Virtual for dynamic score calculation (matches your route logic)
playerSchema.virtual('score').get(function() {
  return this.deaths > 0 ? parseFloat((this.kills / this.deaths).toFixed(2)) : this.kills;
});

// Indexes for performance
playerSchema.index({ nickname: 1 }, { unique: true });
playerSchema.index({ email: 1 }, { unique: true });
playerSchema.index({ headsetId: 1 }, { sparse: true });
playerSchema.index({ score: -1 });  // For leaderboard queries

module.exports = mongoose.model('PlayersContact', playerSchema);