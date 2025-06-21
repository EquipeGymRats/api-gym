// api/models/Reminder.js

const mongoose = require('mongoose');

const ReminderSchema = new mongoose.Schema({
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
    },
    type: {
        type: String,
        enum: ['water', 'meal', 'custom'], // Tipos de lembrete: Água, Refeição, Personalizado
        required: true,
    },
    message: {
        type: String,
        required: true,
        trim: true,
        maxlength: 100,
    },
    time: { // Formato "HH:MM" (ex: "14:30")
        type: String,
        required: true,
    },
    days: { // Dias da semana em que o lembrete se repete
        type: [String], // ex: ['Segunda-feira', 'Quarta-feira', 'Sexta-feira']
        required: true,
    },
    isActive: {
        type: Boolean,
        default: true,
    },
    createdAt: {
        type: Date,
        default: Date.now,
    },
});

// Índice para otimizar buscas por usuário
ReminderSchema.index({ user: 1, isActive: 1 });

module.exports = mongoose.model('Reminder', ReminderSchema);