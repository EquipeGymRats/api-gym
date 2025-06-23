// routes/user.js

const express = require('express');
const router = express.Router();
const User = require('../models/User');
const Training = require('../models/Training');
const Nutrition = require('../models/Nutrition');
const { getLevelInfo } = require('../config/levels');
const authMiddleware = require('../middleware/auth'); // Middleware de autenticação

/**
 * @route   GET /api/user/:username
 * @desc    Obter perfil PÚBLICO e COMPLETO de um usuário para o modal.
 * @access  Autenticado
 */
router.get('/:username', authMiddleware, async (req, res) => {
    try {
        const loggedInUserId = req.user.id; // ID do usuário que está fazendo a requisição

        // 1. Encontra o usuário pelo nome
        const userProfile = await User.findOne({ username: req.params.username })
            .select('username profilePicture xp createdAt following') // Seleciona campos públicos + 'following' para checagem
            .lean();

        if (!userProfile) {
            return res.status(404).json({ message: 'Usuário não encontrado.' });
        }

        // 2. Busca os planos de treino e nutrição do usuário
        const trainingPlan = await Training.findOne({ user: userProfile._id }).lean();
        const nutritionPlan = await Nutrition.findOne({ user: userProfile._id }).lean();

        // 3. Verifica se o usuário logado já segue este perfil
        const loggedInUser = await User.findById(loggedInUserId).select('following').lean();
        
        const isFollowing = loggedInUser && Array.isArray(loggedInUser.following)
            ? loggedInUser.following.some(id => id.equals(userProfile._id))
            : false;

        // 4. Monta a resposta final
        const fullProfile = {
            _id: userProfile._id,
            username: userProfile.username,
            profilePicture: userProfile.profilePicture,
            createdAt: userProfile.createdAt,
            levelInfo: getLevelInfo(userProfile.xp),
            training: trainingPlan, // Pode ser null
            nutrition: nutritionPlan, // Pode ser null
            isFollowing: isFollowing // Adiciona o status de "seguindo"
        };

        res.json(fullProfile);

    } catch (error) {
        console.error('Erro ao buscar perfil de usuário:', error);
        res.status(500).json({ message: 'Erro no servidor' });
    }
});

/**
 * @route   POST /api/user/:userId/follow
 * @desc    Seguir um usuário
 * @access  Autenticado
 */
router.post('/:userId/follow', authMiddleware, async (req, res) => {
    try {
        const userToFollowId = req.params.userId;
        const currentUserId = req.user.id;

        if (userToFollowId === currentUserId) {
            return res.status(400).json({ message: 'Você não pode seguir a si mesmo.' });
        }

        // Adiciona o userToFollowId na lista 'following' do usuário atual
        await User.findByIdAndUpdate(currentUserId, { $addToSet: { following: userToFollowId } });

        // Adiciona o currentUserId na lista 'followers' do outro usuário
        await User.findByIdAndUpdate(userToFollowId, { $addToSet: { followers: currentUserId } });

        res.json({ message: 'Usuário seguido com sucesso.' });
    } catch (error) {
        res.status(500).json({ message: 'Erro no servidor.' });
    }
});

/**
 * @route   POST /api/user/:userId/unfollow
 * @desc    Deixar de seguir um usuário
 * @access  Autenticado
 */
router.post('/:userId/unfollow', authMiddleware, async (req, res) => {
    try {
        const userToUnfollowId = req.params.userId;
        const currentUserId = req.user.id;

        // Remove o userToUnfollowId da lista 'following' do usuário atual
        await User.findByIdAndUpdate(currentUserId, { $pull: { following: userToUnfollowId } });

        // <<< INÍCIO DA CORREÇÃO >>>
        // Remove o currentUserId da lista 'followers' do outro usuário
        await User.findByIdAndUpdate(userToUnfollowId, { $pull: { followers: currentUserId } });
        // <<< FIM DA CORREÇÃO >>>

        res.json({ message: 'Você deixou de seguir o usuário.' });
    } catch (error) {
        res.status(500).json({ message: 'Erro no servidor.' });
    }
});

module.exports = router;
