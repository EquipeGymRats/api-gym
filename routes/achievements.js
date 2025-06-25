const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/auth');
const Achievement = require('../models/Achievement');

/**
 * @route   GET /api/achievements
 * @desc    Obter a lista de todas as conquistas possíveis
 * @access  Autenticado
 */
router.get('/', authMiddleware, async (req, res) => {
    try {
        const achievements = await Achievement.find().lean();
        res.json(achievements);
    } catch (error) {
        console.error('Erro ao buscar conquistas:', error);
        res.status(500).json({ message: 'Erro ao buscar conquistas.' });
    }
});

module.exports = router;