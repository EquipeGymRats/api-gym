// api/routes/nutrition.js
const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/auth');
const Nutrition = require('../models/Nutrition');
const crypto = require('crypto');

// Rota para SALVAR ou ATUALIZAR o plano de alimentação
router.post('/', authMiddleware, async (req, res) => {
    const { userInputs, plan, tips, signature } = req.body;
    const userId = req.user.id;

    if (!signature) {
        return res.status(400).json({ message: 'Falha na verificação de integridade: assinatura ausente.' });
    }

    try {
        // Recria a assinatura no backend para validação
        const planString = JSON.stringify(plan);
        const expectedSignature = crypto
            .createHmac('sha256', process.env.INTEGRITY_SECRET)
            .update(planString)
            .digest('hex');

        // Comparação segura para evitar ataques de temporização
        const isValid = crypto.timingSafeEqual(Buffer.from(signature, 'hex'), Buffer.from(expectedSignature, 'hex'));

        if (!isValid) {
            console.warn(`Tentativa de salvar plano de nutrição com assinatura inválida para o usuário ${userId}`);
            return res.status(403).json({ message: 'Falha na verificação de integridade. O plano pode ter sido adulterado.' });
        }

        const nutritionData = {
            user: userId,
            userInputs,
            plan,
            tips,
            dateGenerated: new Date()
        };

        const savedNutritionPlan = await Nutrition.findOneAndUpdate(
            { user: userId },
            nutritionData,
            { new: true, upsert: true, runValidators: true }
        );

        res.status(200).json({ message: 'Plano alimentar salvo com sucesso!', plan: savedNutritionPlan });

    } catch (error) {
        console.error('Erro ao salvar plano alimentar:', error);
        res.status(500).json({ message: 'Erro no servidor ao salvar o plano alimentar.' });
    }
});

// Rota para CARREGAR o plano de alimentação salvo
router.get('/', authMiddleware, async (req, res) => {
    const userId = req.user.id;

    try {
        const nutritionPlan = await Nutrition.findOne({ user: userId });

        if (nutritionPlan) {
            res.status(200).json(nutritionPlan);
        } else {
            res.status(404).json({ message: 'Nenhum plano alimentar salvo encontrado.' });
        }
    } catch (error) {
        console.error('Erro ao carregar plano alimentar:', error);
        res.status(500).json({ message: 'Erro no servidor ao carregar o plano alimentar.' });
    }
});

module.exports = router;