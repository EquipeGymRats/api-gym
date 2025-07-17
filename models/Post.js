// models/Post.js
const mongoose = require('mongoose');
const sanitizeHtml = require('sanitize-html');

const CommentSchema = new mongoose.Schema({
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
    },
    text: {
        type: String,
        required: true,
    },
    createdAt: {
        type: Date,
        default: Date.now,
    }
}, { _id: true, timestamps: true });

// Sanitiza o texto do comentário antes de salvar para prevenir XSS
CommentSchema.pre('save', function(next) {
    if (this.isModified('text')) {
        this.text = sanitizeHtml(this.text, {
            allowedTags: ['b', 'i', 'em', 'strong', 'u'], // Permite tags básicas de formatação
            allowedAttributes: {}
        });
    }
    next();
});

const PostSchema = new mongoose.Schema({
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
    },
    text: {
        type: String,
        required: true,
        maxlength: 500, // Aumentado para mais flexibilidade
    },
    imageUrl: {
        type: String,
        default: ''
    },
    likes: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    }],
    comments: [CommentSchema],
    createdAt: {
        type: Date,
        default: Date.now,
        expires: '30d', // Posts expiram em 30 dias
    }
});

module.exports = mongoose.model('Post', PostSchema);