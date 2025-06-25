const mongoose = require('mongoose');

const AchievementSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
        unique: true
    },
    description: {
        type: String,
        required: true
    },
    mascotImageUrl: {
        type: String,
        required: true
    },
    criteria: { // Critério para desbloquear
        type: {
            type: String,
            enum: ['totalWorkouts', 'streak', 'level'],
            required: true
        },
        value: {
            type: Number,
            required: true
        }
    }
});

module.exports = mongoose.model('Achievement', AchievementSchema);