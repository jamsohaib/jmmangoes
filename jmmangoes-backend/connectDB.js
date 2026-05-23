const mongoose = require("mongoose");
const logger = require("./utils/logger");

async function connectToMongoDB(){
  const mongoUri = process.env.MONGO_URI || "mongodb://localhost:27017/JMMangoes";
  mongoose.connect(mongoUri, {
    autoIndex: true,
  })
  .then(() => { logger.info("MongoDB connection established"); })
  .catch((err) => { logger.error("MongoDB connection failed", { error: err?.message || String(err) }); });

}






module.exports = {
    connectToMongoDB,
}
