// routes/auth.js (exemplo completo)
const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User'); // Certifique-se de que o caminho está correto
const authMiddleware = require('../middleware/auth'); // Importa o middleware de autenticação
const { getLevelInfo } = require('../config/levels'); // <<< ADICIONE ESTA LINHA no topo


// Rota de Registro
router.post('/register', async (req, res) => {
    const { username, email, password } = req.body;

    try {
        let user = await User.findOne({ email });
        if (user) {
            return res.status(400).json({ message: 'Usuário já existe com este e-mail.' });
        }

        user = new User({
            username,
            email,
            password,
            // role: 'user' e isActive: true serão definidos por padrão pelo schema
        });

        await user.save();

        const payload = {
            user: {
                id: user.id,
                username: user.username,
                email: user.email,
                role: user.role, // Inclui a role
                isActive: user.isActive // Inclui o status
            }
        };

        jwt.sign(
            payload,
            process.env.JWT_SECRET,
            { expiresIn: '1h' },
            (err, token) => {
                if (err) throw err;
                res.status(201).json({ message: 'Usuário registrado com sucesso!', token });
            }
        );

    } catch (error) {
        console.error(error.message);
        res.status(500).send('Erro no Servidor.');
    }
});

// Rota de Login
router.post('/login', async (req, res) => {
    const { email, password } = req.body;

    try {
        let user = await User.findOne({ email });

        if (!user) {
            return res.status(400).json({ message: 'Credenciais inválidas.' });
        }

        // NOVO: Verificar se o usuário está ativo
        if (!user.isActive) {
            return res.status(403).json({ message: 'Sua conta está desativada. Entre em contato com o suporte.' });
        }

        const isMatch = await user.comparePassword(password);

        if (!isMatch) {
            return res.status(400).json({ message: 'Credenciais inválidas.' });
        }

        // Payload do token agora inclui a role e o status isActive
        const payload = {
            user: {
                id: user.id,
                username: user.username,
                email: user.email,
                role: user.role,
                isActive: user.isActive
            }
        };

        jwt.sign(
            payload,
            process.env.JWT_SECRET,
            { expiresIn: '1h' },
            (err, token) => {
                if (err) throw err;
                res.json({ token });
            }
        );

    } catch (error) {
        console.error(error.message);
        res.status(500).send('Erro no Servidor.');
    }
});

router.get('/profile', authMiddleware, async (req, res) => {
    try {
        const user = await User.findById(req.user.id).select('-password'); // Exclui a senha

        if (!user) {
            return res.status(404).json({ message: 'Usuário não encontrado.' });
        }

        // Retorna apenas as informações que o frontend precisa
        res.json({
            id: user._id,
            username: user.username,
            email: user.email,
            xp: user.xp,
            levelInfo: getLevelInfo(user.xp)
            // Adicione outras informações do perfil aqui, se houver
        });
    } catch (error) {
        console.error('Erro ao buscar perfil:', error.message);
        res.status(500).json({ message: 'Erro ao buscar dados do perfil.' });
    }
});

module.exports = router;