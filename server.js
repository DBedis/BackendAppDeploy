const express = require('express');
const bodyParser = require('body-parser');
const mongoose = require('mongoose');
const keys = require('./config/keys.js');
const dns = require('dns'); // Added for DNS verification




const app = express();

// Enhanced configuration
const CONFIG = {
  MAX_RETRIES: 15, // Increased from 10
  BASE_DELAY: 3000, // 3 seconds base delay
  MONGO_OPTIONS: {
    serverSelectionTimeoutMS: 5000, // Increased from 3000
    socketTimeoutMS: 30000, // Increased from 20000
    maxPoolSize: 15, // Increased connection pool
    connectTimeoutMS: 10000, // Added explicit connect timeout
    heartbeatFrequencyMS: 10000 // Control how often to check connection
  }
};

// Middleware with enhanced security
app.use(bodyParser.urlencoded({ extended: true, limit: '10kb' })); // Changed to extended: true
app.use(bodyParser.json({ limit: '10kb' }));

// Basic request logging (useful on Render)
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  next();
});

// DNS verification before connection attempts
const verifyDNSResolution = async (uriString) => {
  const parsed = new URL(uriString);
  const isSrv = parsed.protocol === 'mongodb+srv:';
  const host = parsed.hostname || 'mongo';
  return new Promise((resolve, reject) => {
    if (isSrv) {
      const srvRecord = `_mongodb._tcp.${host}`;
      dns.resolveSrv(srvRecord, (err) => {
        if (err) {
          console.error(`DNS SRV resolution failed for ${srvRecord}:`, err);
          reject(err);
        } else {
          resolve();
        }
      });
    } else {
      dns.lookup(host, (err) => {
        if (err) {
          console.error(`DNS resolution failed for ${host}:`, err);
          reject(err);
        } else {
          resolve();
        }
      });
    }
  });
};

const getMongoURI = () => {
  const baseURI = process.env.MONGODB_URI || keys.mongoURI ||
    'mongodb://mongo:27017/ArenaVRAdminPanel';

  // Ensure critical parameters are always present
  const url = new URL(baseURI);
  url.searchParams.set('retryWrites', 'true');
  url.searchParams.set('w', 'majority');
  url.searchParams.set('appName', process.env.MONGODB_APP_NAME || 'Cluster0');

  return url.toString();
};

const connectWithRetry = async (attempt = 1) => {
  const uri = getMongoURI();
  
  try {
    console.log(`Attempt ${attempt}/${CONFIG.MAX_RETRIES}: Connecting to MongoDB...`);
    
    // Verify DNS resolution first
    await verifyDNSResolution(uri);
    
    await mongoose.connect(uri, CONFIG.MONGO_OPTIONS);
    
    console.log('✅ MongoDB connected successfully');
    initializeApplication();
  } catch (err) {
    console.error(`❌ Connection failed:`, err.message);
    
    if (attempt >= CONFIG.MAX_RETRIES) {
      console.error('⛔ Maximum retry attempts reached. Exiting...');
      process.exit(1);
    }
    
    // Exponential backoff with jitter
    const delay = Math.min(
      CONFIG.BASE_DELAY * Math.pow(2, attempt - 1) + Math.random() * 1000,
      60000 // Max 60 seconds
    );
    
    console.log(`⌛ Retrying in ${(delay/1000).toFixed(1)} seconds...`);
    setTimeout(() => connectWithRetry(attempt + 1), delay);
  }
};

// Initialize application
let serverRef;
const initializeApplication = () => {
  // Model loading with verification
  const loadModel = (modelPath) => {
    try {
      require(modelPath);
    } catch (err) {
      console.error(`Failed to load model ${modelPath}:`, err);
      process.exit(1);
    }
  };

  loadModel('./model/AccountDetails');
  loadModel('./model/TeamsDetails');
  loadModel('./model/PlayersContact');
  loadModel('./model/GameSession');

  // Route loading
  const loadRoute = (routePath) => {
    try {
      require(routePath)(app);
    } catch (err) {
      console.error(`Failed to load route ${routePath}:`, err);
    }
  };

  loadRoute('./routes/authenticationRoutes');
  loadRoute('./routes/Players');
  loadRoute('./routes/SessionRoutes');

  // Mount router-based routes
  const gameSessionRoutes = require('./routes/GameSessionRoutes');
  app.use('/api/game-sessions', gameSessionRoutes);
  console.log('Mounted game sessions at /api/game-sessions');

  // Health check (used by Render)
  app.get('/health', (req, res) => {
    const mongoStatus = mongoose.connection.readyState;
    const isHealthy = mongoStatus === 1;
    res.status(isHealthy ? 200 : 503).json({
      status: isHealthy ? 'healthy' : 'unhealthy',
      mongoStatus: mongoose.STATES[mongoStatus],
      uptime: process.uptime(),
      timestamp: new Date().toISOString()
    });
  });

  // Error handling
  app.use((err, req, res, next) => {
    console.error('❗ Error:', {
      message: err.message,
      stack: err.stack,
      path: req.path,
      method: req.method
    });
    res.status(500).json({ 
      error: 'Internal Server Error',
      requestId: req.id
    });
  });

  const PORT = process.env.PORT || keys.port || 13776;
  serverRef = app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Server running on port ${PORT}`);
    console.log(`📊 MongoDB status: ${mongoose.STATES[mongoose.connection.readyState]}`);
  });
};

// Enhanced connection event handlers
mongoose.connection.on('connected', () => {
  console.log('🔗 Mongoose connected to MongoDB');
  console.log(`📡 Connection info: ${mongoose.connection.host}:${mongoose.connection.port}/${mongoose.connection.name}`);
});

mongoose.connection.on('error', (err) => {
  console.error('‼️ Mongoose connection error:', {
    message: err.message,
    stack: err.stack,
    code: err.code,
    codeName: err.codeName
  });
});

mongoose.connection.on('disconnected', () => {
  console.warn('⚠️ Mongoose disconnected from MongoDB');
});

// Start with connection retry
connectWithRetry();

// Enhanced graceful shutdown
const shutdown = async (signal) => {
  console.log(`🛑 Received ${signal}, shutting down gracefully...`);
  
  try {
    await mongoose.connection.close();
    console.log('🔌 MongoDB connection closed');
    
    if (serverRef) {
      serverRef.close(() => {
      console.log('🛑 HTTP server closed');
      process.exit(0);
      
      });
    } else {
      process.exit(0);
    }
    
    // Force shutdown if hanging
    setTimeout(() => {
      console.error('⏰ Shutdown timeout, forcing exit');
      process.exit(1);
    }, 10000);
  } catch (err) {
    console.error('❌ Shutdown error:', err);
    process.exit(1);
  }
};

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

// Handle uncaught exceptions
process.on('uncaughtException', (err) => {
  console.error('💥 Uncaught Exception:', err);
  shutdown('uncaughtException');
});