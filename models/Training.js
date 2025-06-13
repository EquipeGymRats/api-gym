// models/Training.js
const mongoose = require('mongoose');

// 1. Definir o Schema para um Exercício
const ExerciseSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true
    },
    setsReps: {
        type: String,
        required: true
    },
    tips: {
        type: String,
        required: true
    },
    muscleGroups: {
        type: [String], // Array de strings
        required: true
    },
    difficulty: {
        type: Number, // Número inteiro
        required: true
        // Você pode adicionar validação aqui, ex: min: 1, max: 5
    },
    tutorialSteps: {
        type: [String], // Array de strings
        required: true
    }
}, { _id: false }); // _id: false para não criar _id para cada subdocumento de exercício, se não for necessário

// 2. Definir o Schema para um Dia de Treino
const DaySchema = new mongoose.Schema({
    dayName: {
        type: String,
        required: true
    },
    exercises: {
        type: [ExerciseSchema], // Array de objetos ExerciseSchema
        default: [] // Um dia pode não ter exercícios
    }
}, { _id: false }); // _id: false para não criar _id para cada subdocumento de dia, se não for necessário

// 3. Definir o Schema Principal de Treino
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
        type: [DaySchema], // Agora é um array de objetos DaySchema
        required: true,
        default: [] // Pode ser um array vazio se o plano não for gerado ainda
    },
    recommendations: { // NOVO CAMPO: Para salvar as recomendações da IA
        type: [String], // Array de strings
        default: []
    },
    dateGenerated: {
        type: Date,
        default: Date.now
    }
});

module.exports = mongoose.model('Training', TrainingSchema);