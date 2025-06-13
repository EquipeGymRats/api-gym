// models/Post.js
const mongoose = require('mongoose');

const PostSchema = new mongoose.Schema({
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
    },
    text: {
        type: String,
        required: true,
        maxlength: 280,
    },
    imageUrl: {
        type: String,
        default: ''
    },
    createdAt: {
        type: Date,
        default: Date.now,
        // Esta opção 'expires' já cria o índice TTL automaticamente.
        // O valor é em segundos (30 dias = 2592000 segundos).
        expires: 2592000, 
    }
});

// A linha que criava o índice duplicado foi removida.

module.exports = mongoose.model('Post', PostSchema);