// models/WorkoutLog.js
const mongoose = require('mongoose');

const WorkoutLogSchema = new mongoose.Schema({
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
    },
    trainingId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Training',
        required: true,
    },
    trainingDayName: {
        type: String,
        required: true,
    },
    dateCompleted: {
        type: Date,
        default: Date.now,
    },
});

WorkoutLogSchema.index({ user: 1, trainingId: 1, trainingDayName: 1, dateCompleted: 1 }, { unique: true });


module.exports = mongoose.model('WorkoutLog', WorkoutLogSchema);