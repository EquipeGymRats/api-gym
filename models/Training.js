// models/Training.js
const mongoose = require('mongoose');

const TrainingSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    unique: true // Garante que cada usuário tenha apenas um treino salvo
  },
  level: {
    type: String,
    required: true
  },
  objective: {
    type: String,
    required: true
  },
  frequency: {
    type: String,
    required: true
  },
  equipment: {
    type: String,
    required: true
  },
  timePerSession: {
    type: String,
    required: true
  },
  plan: {
    type: Array, // Salva o plano de treino como um array de objetos
    required: true
  },
  dateGenerated: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model('Training', TrainingSchema);