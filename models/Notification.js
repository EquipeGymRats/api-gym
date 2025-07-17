// models/Notification.js
const mongoose = require('mongoose');

const NotificationSchema = new mongoose.Schema({
    recipient: { // O usuário que RECEBE a notificação
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true
    },
    sender: { // O usuário que ENVIOU a ação (curtiu, comentou)
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    post: { // O post relacionado à notificação
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Post'
    },
    type: { // Tipo: 'like' ou 'comment'
        type: String,
        enum: ['like', 'comment'],
        required: true
    },
    commentText: { // Preview do comentário
        type: String,
    },
    read: { // Status de leitura
        type: Boolean,
        default: false,
        index: true
    },
    createdAt: {
        type: Date,
        default: Date.now,
        expires: '7d' // Notificações também expiram em 30 dias
    }
});

module.exports = mongoose.model('Notification', NotificationSchema);