const mongoose = require('mongoose');
const { Schema } = mongoose;

const SessionSchema = new Schema({
  nickname: { type: String, required: true },
  map: { type: String, required: true },
  durationInMinutes: { type: Number, required: true }, // Clean and clear
  createdAt: { type: Date, default: Date.now }
});

mongoose.model('SessionDetails', SessionSchema);
