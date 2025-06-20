// routes/auth.js (exemplo completo)
const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User'); // Certifique-se de que o caminho está correto
const authMiddleware = require('../middleware/auth'); // Importa o middleware de autenticação
const { getLevelInfo } = require('../config/levels'); // <<< ADICIONE ESTA LINHA no topo
const multer = require('multer'); // Para lidar com upload de arquivos
const cloudinary = require('cloudinary').v2; // Para upload de imagen
const { OAuth2Client } = require('google-auth-library');
const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
});

const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

// Configuração do Multer para upload em memória

router.post('/google-signin', async (req, res) => {
    const { token } = req.body;
    try {
        // 1. Verifica o token recebido do frontend com o Google
        const ticket = await client.verifyIdToken({
            idToken: token,
            audience: process.env.GOOGLE_CLIENT_ID,
        });
        const { name, email, sub: googleId, picture } = ticket.getPayload();

        // 2. Procura se o usuário já existe na nossa base de dados
        let user = await User.findOne({ googleId: googleId });

        if (!user) {
            // 2a. Se não existir, verifica se existe um usuário com o mesmo email (conta local)
            user = await User.findOne({ email: email });

            if (user) {
                // Se o e-mail já existe (conta local), vincula a conta Google
                user.googleId = googleId;
                user.profilePicture = user.profilePicture || picture; // Atualiza a foto se não houver uma
                await user.save();
            } else {
                // 2b. Se não existe de forma alguma, cria um novo usuário
                user = new User({
                    googleId,
                    username: name,
                    email,
                    profilePicture: picture,
                    // A senha não é necessária, pois a validação do schema foi ajustada
                });
                await user.save();
            }
        }

        // 3. Cria o JWT da nossa aplicação para o usuário
        const payload = {
            user: {
                id: user.id,
                username: user.username,
                role: user.role,
            },
        };

        jwt.sign(
            payload,
            process.env.JWT_SECRET,
            { expiresIn: '1h' },
            (err, appToken) => {
                if (err) throw err;
                // 4. Envia nosso token para o frontend
                res.json({ token: appToken });
            }
        );

    } catch (error) {
        console.error('Erro na autenticação com Google:', error);
        res.status(401).json({ message: 'Falha na autenticação com Google. Token inválido.' });
    }
});



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
// this route now checks if the user is active before allowing login
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

        // Retorna todas as informações necessárias para o frontend, incluindo os novos campos
        res.json({
            id: user._id,
            username: user.username,
            email: user.email,
            xp: user.xp,
            levelInfo: getLevelInfo(user.xp),
            profilePicture: user.profilePicture,
            weight: user.weight,
            height: user.height,
            mainObjective: user.mainObjective,
            experienceLevel: user.experienceLevel,
            // Adicione outras informações do perfil aqui, se houver
        });
    } catch (error) {
        console.error(error.message);
        res.status(500).send('Erro no Servidor ao carregar perfil.');
    }
});


router.put('/profile', authMiddleware, upload.single('profilePicture'), async (req, res) => {
    const { username, weight, height, mainObjective, experienceLevel } = req.body;
    const userId = req.user.id;

    try {
        let user = await User.findById(userId);

        if (!user) {
            return res.status(404).json({ message: 'Usuário não encontrado.' });
        }

        // Atualiza campos de texto
        if (username) user.username = username;
        if (weight) user.weight = parseFloat(weight);
        if (height) user.height = parseInt(height);
        if (mainObjective) user.mainObjective = mainObjective;
        if (experienceLevel) user.experienceLevel = experienceLevel;

        // Lidar com o upload da imagem de perfil para o Cloudinary
        if (req.file) {
            // ---> MELHORIA: Converte o buffer para um Data URI, que é mais robusto <---
            const fileStr = `data:${req.file.mimetype};base64,${req.file.buffer.toString('base64')}`;
            
            const result = await cloudinary.uploader.upload(fileStr, {
                folder: 'gymrats_profile_pictures',
                format: 'webp',
                transformation: [
                    {width: 200, height: 200, crop: "fill", gravity: "face"},
                    {quality: "auto"}
                ]
            });
            user.profilePicture = result.secure_url;
        }

        await user.save();

        const levelInfo = getLevelInfo(user.xp);

        // Retorna o perfil atualizado completo
        res.json({
            // ... (todos os campos do perfil como na sua rota GET /profile)
            id: user._id,
            username: user.username,
            email: user.email,
            xp: user.xp,
            levelInfo: levelInfo,
            profilePicture: user.profilePicture,
            weight: user.weight,
            height: user.height,
            mainObjective: user.mainObjective,
            experienceLevel: user.experienceLevel,
            message: 'Perfil atualizado com sucesso!'
        });

    } catch (error) {
        // ---> MELHORIA: Tratamento de Erro Específico <---
        console.error('Erro ao atualizar perfil:', error);

        // Se for um erro de chave duplicada (ex: username já existe)
        if (error.code === 11000) {
            return res.status(400).json({ message: 'Este nome de usuário ou e-mail já está em uso.' });
        }
        // Se for um erro de validação do Schema (ex: valor inválido para enum)
        if (error.name === 'ValidationError') {
            return res.status(400).json({ message: `Erro de validação: ${Object.values(error.errors).map(e => e.message).join(', ')}` });
        }

        // Para todos os outros erros (incluindo falhas no Cloudinary)
        res.status(500).json({ message: 'Erro no Servidor ao atualizar perfil.' });
    }
});

module.exports = router;