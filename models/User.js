const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

// Schema para um único registro de progresso (peso ou medida)
const ProgressEntrySchema = new mongoose.Schema({
    date: {
        type: Date,
        default: Date.now
    },
    value: {
        type: Number,
        required: true
    }
}, { _id: false });

// Schema para as conquistas desbloqueadas pelo usuário
const UnlockedAchievementSchema = new mongoose.Schema({
    achievementId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Achievement', // Referência ao novo modelo de Conquistas
        required: true
    },
    date: {
        type: Date,
        default: Date.now
    }
}, { _id: false });

const UserSchema = new mongoose.Schema({
    username: {
        type: String,
        required: true,
        unique: true,
        trim: true
    },
    email: {
        type: String,
        required: true,
        unique: true,
        trim: true
    },
    password: {
        type: String,
        // Senha não é obrigatória para permitir login com Google
    },
    googleId: {
        type: String,
        unique: true,
        sparse: true // Permite múltiplos documentos nulos, mas valores únicos se existirem
    },
    role: {
        type: String,
        enum: ['user', 'admin', 'vip'],
        default: 'user'
    },
    profilePicture: {
        type: String,
        default: 'https://res.cloudinary.com/gymrats/image/upload/v1716339538/default_avatar.png'
    },
    xp: {
        type: Number,
        default: 0
    },
    isActive: {
        type: Boolean,
        default: true
    },
    // --- CAMPOS DE PROGRESSÃO ADICIONADOS ---
    mainObjective: String,
    experienceLevel: String,
    progress: {
        weight: [ProgressEntrySchema], // Histórico de peso
        measurements: {
            biceps: [ProgressEntrySchema],
            chest: [ProgressEntrySchema],
            waist: [ProgressEntrySchema],
            hips: [ProgressEntrySchema],
            thighs: [ProgressEntrySchema] // Coxas
        }
    },
    unlockedAchievements: [UnlockedAchievementSchema], // Histórico de conquistas
    // -----------------------------------------
    createdAt: {
        type: Date,
        default: Date.now
    }
});

// Hook para criptografar a senha antes de salvar
UserSchema.pre('save', async function(next) {
    if (!this.isModified('password') || !this.password) {
        return next();
    }
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
    next();
});

// Método para comparar senhas
UserSchema.methods.comparePassword = function(candidatePassword) {
    return bcrypt.compare(candidatePassword, this.password);
};

module.exports = mongoose.model('User', UserSchema);