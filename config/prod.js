module.exports = {
    port : process.env.PORT,
    // Render sets MONGODB_URI (or you can define it manually). Prefer MONGODB_URI.
    mongoURI : process.env.MONGODB_URI || process.env.MONGO_URI,
};