// models/WorkoutLog.js
const mongoose = require('mongoose');

const WorkoutLogSchema = new mongoose.Schema({
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
    },
    // O nome do dia do treino que foi concluído, ex: "Treino A: Peito e Tríceps" ou "Segunda-feira"
    trainingDayName: {
        type: String,
        required: true,
    },
    // A data em que o treino foi marcado como concluído
    dateCompleted: {
        type: Date,
        default: Date.now,
    },
});

// Índice para garantir que um usuário não possa logar o mesmo dia de treino múltiplas vezes na mesma data
// Isso é uma camada extra de proteção no banco de dados.
WorkoutLogSchema.index({ user: 1, trainingDayName: 1, dateCompleted: 1 }, { unique: true });

module.exports = mongoose.model('WorkoutLog', WorkoutLogSchema);