// routes/notifications.js
const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/auth');
const Notification = require('../models/Notification');
const NodeCache = require('node-cache');

// Cache para notificações não lidas. TTL de 2 minutos para manter os dados atualizados.
const notificationCache = new NodeCache({ stdTTL: 120, checkperiod: 60 });

// Rota para buscar notificações do usuário logado
router.get('/', authMiddleware, async (req, res) => {
    const userId = req.user.id;
    const cacheKey = `notifications_${userId}`;
    
    const cachedData = notificationCache.get(cacheKey);
    if (cachedData) {
        return res.json(cachedData);
    }

    try {
        const notifications = await Notification.find({ recipient: userId })
            .sort({ createdAt: -1 })
            .limit(30)
            .populate('sender', 'username profilePicture')
            .lean();
        
        notificationCache.set(cacheKey, notifications);
        res.json(notifications);
    } catch (error) {
        res.status(500).json({ message: 'Erro no servidor.' });
    }
});

// Rota para marcar TODAS as notificações como lidas
router.post('/read-all', authMiddleware, async (req, res) => {
    try {
        await Notification.updateMany({ recipient: req.user.id, read: false }, { $set: { read: true } });
        notificationCache.del(`notifications_${req.user.id}`); // Invalida o cache
        res.status(200).json({ message: 'Todas as notificações foram marcadas como lidas.' });
    } catch (error) {
        res.status(500).json({ message: 'Erro ao marcar notificações como lidas.' });
    }
});

module.exports = router;