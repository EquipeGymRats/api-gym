// models/User.js
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const UserSchema = new mongoose.Schema({
  username: {
    type: String,
    required: true,
    unique: true,
  },
  email: {
    type: String,
    required: true,
    unique: true,
  },
  password: {
    type: String,
    required: true,
  },
  role: {
    type: String,
    enum: ['user', 'admin'],
    default: 'user',
  },
  isActive: {
    type: Boolean,
    default: true,
  },
  xp: {
    type: Number,
    default: 0
  },
  // NOVOS CAMPOS PARA O PERFIL
  profilePicture: { // URL da imagem de perfil
    type: String,
    default: 'https://www.svgrepo.com/show/452030/avatar-default.svg' // Substitua pela URL da sua imagem padrão
  },
  weight: { // Peso do usuário (em kg)
    type: Number,
    min: 1,
    max: 500 // Limite razoável
  },
  height: { // Altura do usuário (em cm)
    type: Number,
    min: 50,
    max: 300 // Limite razoável
  },
  mainObjective: { // Objetivo principal de treino
    type: String,
    enum: ['Ganho de Massa Muscular', 'Perda de Peso', 'Aumento de Força', 'Melhora de Resistência', 'Saúde e Bem-estar'],
    default: 'Saúde e Bem-estar'
  },
  experienceLevel: { // Nível de experiência
    type: String,
    enum: ['Iniciante', 'Intermediário', 'Avançado'],
    default: 'Iniciante'
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

// Middleware Mongoose para hash da senha antes de salvar
UserSchema.pre('save', async function (next) {
  if (!this.isModified('password')) {
    next();
  }
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
  next();
});

UserSchema.methods.comparePassword = async function (candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

module.exports = mongoose.models.User || mongoose.model('User', UserSchema);