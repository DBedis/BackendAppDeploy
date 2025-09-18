const mongoose = require('mongoose');
const { Schema } = mongoose;


const teamsSchema =  new Schema({
    headsetId: { type: String,default: null},
    TeamName: {type: String,default:null , required:true },
    nickname: { type: String, required: true },
    lastUpdated: { type: Date, default: Date.now },
});


mongoose.model('TeamsDetails', teamsSchema);
