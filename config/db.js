// config/db.js
const mongoose = require('mongoose');
require('dotenv').config();

const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI, {
      // Essas opções são agora desnecessárias com versões recentes do Mongoose/MongoDB Driver
      // useNewUrlParser: true, // REMOVER ESTA LINHA
      // useUnifiedTopology: true, // REMOVER ESTA LINHA
    });
    console.log('MongoDB Conectado...');
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }
};

module.exports = connectDB;