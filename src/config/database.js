const mongoose = require('mongoose');
const logger = require('../utils/logger');

const connectDB = async () => {
  try {
    const options = {
      useNewUrlParser: true,
      useUnifiedTopology: true,
      serverSelectionTimeoutMS: 5000,
    };

    await mongoose.connect(process.env.MONGODB_URI, options);

    logger.info(` MongoDB connecté: ${mongoose.connection.host}`);

    mongoose.connection.on('error', (err) => {
      logger.error(` MongoDB erreur: ${err.message}`);
    });

    mongoose.connection.on('disconnected', () => {
      logger.warn(' MongoDB déconnecté');
    });

  } catch (error) {
    logger.error(` Erreur connexion MongoDB: ${error.message}`);
    process.exit(1);
  }
};

module.exports = connectDB;
