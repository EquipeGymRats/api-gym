// api/models/Nutrition.js
const mongoose = require('mongoose');

// Schema para os Macronutrientes de uma refeição
const MacronutrientSchema = new mongoose.Schema({
    protein: { type: String, required: true },
    carbohydrates: { type: String, required: true },
    fats: { type: String, required: true }
}, { _id: false });

// Schema para uma única Refeição
const MealSchema = new mongoose.Schema({
    mealName: { type: String, required: true },
    foods: { type: [String], required: true },
    icon: { type: String, required: true },
    macronutrients: { type: MacronutrientSchema, required: true },
    preparationTip: { type: String }
}, { _id: false });

// Schema para o plano de um Dia
const DayPlanSchema = new mongoose.Schema({
    dayName: { type: String, required: true },
    meals: { type: [MealSchema], required: true }
}, { _id: false });

// Schema Principal do Plano de Nutrição
const NutritionSchema = new mongoose.Schema({
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        unique: true // Garante que cada usuário tenha apenas um plano de nutrição salvo
    },
    userInputs: { // Armazena as entradas do usuário que geraram o plano
        type: Object,
        required: true
    },
    plan: {
        type: [DayPlanSchema],
        required: true
    },
    tips: {
        type: [String],
        default: []
    },
    dateGenerated: {
        type: Date,
        default: Date.now
    }
});

module.exports = mongoose.model('Nutrition', NutritionSchema);