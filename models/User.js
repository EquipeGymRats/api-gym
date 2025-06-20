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
  googleId: { // Novo campo para o ID único do Google
    type: String,
    sparse: true, // Permite valores nulos e únicos
    unique: true
  },  
  password: {
    type: String,
    required: function() { return !this.googleId; } // Senha é obrigatória apenas se não for um login Google
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
      default: function() {
        const initial = this.username ? this.username.charAt(0).toUpperCase() : 'A';
        return `https://placehold.co/100x100/1E1E1E/ffd75d?text=${initial}`;
      }
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