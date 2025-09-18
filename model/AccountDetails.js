const mongoose = require('mongoose');
const { Schema } = mongoose;


const accountSchema =  new Schema({
  Username: { type: String, required: true, unique: true },
  Password: { type: String, required: true }, // Ensure no maxlength
    Salt:String,
    lastAuthentication: { type: Date, default: Date.now },
});


mongoose.model('AccountDetails', accountSchema);
