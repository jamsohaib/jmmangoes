const mongoose = require("mongoose");

async function connectToMongoDB(){
  const mongoUri = process.env.MONGO_URI || "mongodb://localhost:27017/JMMangoes";
  mongoose.connect(mongoUri, {
    autoIndex: true,
  })
  .then(() => { console.log("Connection request to Jm Mangoes successful"); })
  .catch((err) => { console.log(err); });

}






module.exports = {
    connectToMongoDB,
}
