// api/routes/push.js
const express = require('express');
const router = express.Router();
const User = require('../models/User');

// Salva o objeto de inscrição do usuário no banco de dados
router.post('/subscribe', async (req, res) => {
    try {
        const { subscription } = req.body;
        await User.findByIdAndUpdate(req.user.id, { pushSubscription: subscription });
        res.status(201).json({ message: 'Inscrição salva com sucesso.' });
    } catch (error) {
        res.status(500).json({ message: 'Erro ao salvar inscrição.'});
    }
});

module.exports = router;