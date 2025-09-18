const mongoose = require('mongoose');
const Account = mongoose.model('AccountDetails');

const argon2 = require('argon2');
const crypto = require('crypto');

const passwordRegex = new RegExp("(?=.*[a-z])(?=.*[A-Z])(?=.*[0-9])(?=.{8,24})");

module.exports = app => {

    app.post('/account/create', async (req, res) => {
  const response = {};
  const { rUsername, rPassword } = req.body;

  if (!rUsername || rUsername.length < 3) {
    return res.send({ code: 1, msg: "Invalid Credentials" });
  }

  if (!passwordRegex.test(rPassword)) {
    return res.send({ code: 2, msg: "Password Not Secure" });
  }

  try {
    const existing = await Account.findOne({ Username: rUsername }, '_id');
    if (existing) return res.send({ code: 3, msg: "Account already exists" });

    const hash = await argon2.hash(rPassword);
    const newAccount = new Account({
      Username: rUsername,
      Password: hash,
    });

    await newAccount.save();

    return res.send({ code: 0, msg: "Account Created", data: { Username: newAccount.Username } });
  } catch (err) {
    console.error(err);
    return res.status(500).send({ code: 500, msg: "Internal Server Error" });
  }
});
// Test route to verify hashing works
app.post('/debug/hash-test', async (req, res) => {
  const { password } = req.body;
  try {
    const hash = await argon2.hash(password);
    const verify = await argon2.verify(hash, password);
    
    res.json({
      input: password,
      hash,
      verifyResult: verify,
      hashLength: hash.length
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
// Add this route to check hash storage
app.get('/debug/hashes', async (req, res) => {
  const accounts = await Account.find({})
    .select('Username Password')
    .limit(10)
    .lean();
  
  res.json(accounts.map(a => ({
    username: a.Username,
    hashLength: a.Password?.length,
    hashSample: a.Password?.substring(0, 20) + '...'
  })));
});
    //Login Route
app.post('/account/login', async (req, res) => {
  const { rUsername, rPassword } = req.body;
  
  // Enhanced input validation
  if (!rUsername?.trim() || !rPassword?.trim()) {
    return res.status(400).json({ 
      code: 1, 
      msg: "Username and password are required" 
    });
  }

  try {
    // Debug: Print raw inputs
    console.log('Raw input - Username:', rUsername);
    console.log('Raw input - Password:', rPassword);

    const user = await Account.findOne({ Username: rUsername.trim() })
      .select('Username Password')
      .lean();

    if (!user) {
      console.log('User not found:', rUsername);
      return res.status(404).json({ 
        code: 2, 
        msg: "Account not found" 
      });
    }

    // Debug: Print stored hash
    console.log('Stored hash:', user.Password);
    console.log('Hash length:', user.Password?.length);

    // Verify with error handling
    let isValid = false;
    try {
      isValid = await argon2.verify(user.Password, rPassword.trim());
      console.log('Verification result:', isValid);
    } catch (verifyErr) {
      console.error('Argon2 verify error:', verifyErr);
      return res.status(500).json({ 
        code: 500, 
        msg: "Authentication error" 
      });
    }

    if (!isValid) {
      // Test hash generation with same password
      const testHash = await argon2.hash(rPassword.trim());
      console.log('Test hash:', testHash);
      console.log('Compare with stored:', testHash === user.Password);
      
      return res.status(401).json({ 
        code: 1, 
        msg: "Invalid credentials" 
      });
    }

    return res.json({
      code: 0,
      msg: "Login successful",
      data: { Username: user.Username }
    });

  } catch (err) {
    console.error('Login process error:', err);
    return res.status(500).json({ 
      code: 500, 
      msg: "Internal server error" 
    });
  }
});


    app.post('/account/saveaccount', async (req, res) => {
  const { rUsername, rPassword } = req.body;

  if (!rUsername || !rPassword) {
    return res.status(400).send({ code: 1, msg: 'Invalid Credentials' });
  }

  try {
    let userAccount = await Account.findOne({ Username: rUsername });

    if (userAccount) {
      return res.status(409).send({ code: 2, msg: 'Username already taken' });
    }

    // For saving passwords, you should hash them!
    const hash = await argon2.hash(rPassword);

    const newAccount = new Account({
      Username: rUsername,
      Password: hash,
      lastAuthentication: Date.now(),
    });

    await newAccount.save();

    return res.send({ code: 0, msg: 'Account saved', data: { Username: newAccount.Username } });
  } catch (err) {
    console.error(err);
    return res.status(500).send({ code: 500, msg: 'Internal Server Error' });
  }
});
app.get('/debug/account/:username', async (req, res) => {
  const user = await Account.findOne({ Username: req.params.username });
  if (!user) return res.send({ msg: "User not found" });

  res.send({
    Username: user.Username,
    StoredHash: user.Password
  });
});

}