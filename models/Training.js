// models/Training.js
const mongoose = require('mongoose');

const ExerciseSchema = new mongoose.Schema({
    name: { type: String, required: true },
    setsReps: { type: String, required: true },
    tips: { type: String, required: true },
    muscleGroups: { type: [String], required: true },
    difficulty: { type: Number, required: true },
    tutorialSteps: { type: [String], required: true }
}, { _id: false });

const DaySchema = new mongoose.Schema({
    dayName: { type: String, required: true },
    exercises: { type: [ExerciseSchema], default: [] }
}, { _id: false });

const TrainingSchema = new mongoose.Schema({
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
        // unique: true FOI REMOVIDO DAQUI
    },
    level: { type: String, required: true },
    objective: { type: String, required: true },
    frequency: { type: String, required: true },
    equipment: { type: String, required: true },
    timePerSession: { type: String, required: true },
    plan: { type: [DaySchema], required: true, default: [] },
    recommendations: { type: [String], default: [] },
    dateGenerated: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Training', TrainingSchema);