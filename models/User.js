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
  role: { // Campo para definir se o usuário é 'user' ou 'admin'
    type: String,
    enum: ['user', 'admin'],
    default: 'user', // Por padrão, um novo usuário é 'user'
  },
  isActive: { // Campo para ativar/desativar usuários
    type: Boolean,
    default: true, // Por padrão, o usuário está ativo
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

// Método para comparar a senha
UserSchema.methods.comparePassword = async function (candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

module.exports = mongoose.models.User || mongoose.model('User', UserSchema);