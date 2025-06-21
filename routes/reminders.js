// api/routes/reminders.js

const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/auth');
const Reminder = require('../models/Reminder');

// GET: Buscar todos os lembretes do usuário logado
router.get('/', authMiddleware, async (req, res) => {
    try {
        const reminders = await Reminder.find({ user: req.user.id }).sort({ time: 1 });
        res.json(reminders);
    } catch (error) {
        res.status(500).json({ message: 'Erro ao buscar lembretes.' });
    }
});

// POST: Criar um novo lembrete
router.post('/', authMiddleware, async (req, res) => {
    const { type, message, time, days } = req.body;

    if (!type || !message || !time || !days || !Array.isArray(days)) {
        return res.status(400).json({ message: 'Todos os campos são obrigatórios.' });
    }

    try {
        const newReminder = new Reminder({
            user: req.user.id,
            type,
            message,
            time,
            days,
        });
        await newReminder.save();
        res.status(201).json(newReminder);
    } catch (error) {
        res.status(500).json({ message: 'Erro ao criar lembrete.' });
    }
});

// PUT: Atualizar um lembrete (inclusive ativar/desativar)
router.put('/:id', authMiddleware, async (req, res) => {
    try {
        const reminder = await Reminder.findById(req.params.id);

        if (!reminder) {
            return res.status(404).json({ message: 'Lembrete não encontrado.' });
        }
        if (reminder.user.toString() !== req.user.id) {
            return res.status(401).json({ message: 'Não autorizado.' });
        }

        const { type, message, time, days, isActive } = req.body;
        
        // Atualiza os campos fornecidos
        if (type) reminder.type = type;
        if (message) reminder.message = message;
        if (time) reminder.time = time;
        if (days) reminder.days = days;
        if (typeof isActive === 'boolean') reminder.isActive = isActive;

        await reminder.save();
        res.json(reminder);
    } catch (error) {
        res.status(500).json({ message: 'Erro ao atualizar lembrete.' });
    }
});

// DELETE: Deletar um lembrete
router.delete('/:id', authMiddleware, async (req, res) => {
    try {
        const reminder = await Reminder.findById(req.params.id);
        if (!reminder) {
            return res.status(404).json({ message: 'Lembrete não encontrado.' });
        }
        if (reminder.user.toString() !== req.user.id) {
            return res.status(401).json({ message: 'Não autorizado.' });
        }
        
        await Reminder.findByIdAndDelete(req.params.id);
        res.json({ message: 'Lembrete deletado.' });
    } catch (error) {
        res.status(500).json({ message: 'Erro ao deletar lembrete.' });
    }
});

module.exports = router;