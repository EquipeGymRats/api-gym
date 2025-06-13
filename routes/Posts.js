// routes/posts.js

const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/auth');
const Post = require('../models/Post');
const multer = require('multer');
const cloudinary = require('cloudinary').v2;

const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

// Rota para buscar todos os posts do feed (mais recentes primeiro)
router.get('/', authMiddleware, async (req, res) => {
    try {
        const posts = await Post.find()
            .sort({ createdAt: -1 }) // Ordena do mais novo para o mais antigo
            .populate('user', 'username profilePicture'); // Puxa o nome e a foto do autor do post

        res.json(posts);
    } catch (error) {
        res.status(500).json({ message: 'Erro ao buscar posts.' });
    }
});

// Rota para criar um novo post
router.post('/', authMiddleware, upload.single('postImage'), async (req, res) => {
    const { text } = req.body;

    if (!text) {
        return res.status(400).json({ message: 'O texto do post é obrigatório.' });
    }

    try {
        let imageUrl = '';
        if (req.file) {
            const fileStr = `data:${req.file.mimetype};base64,${req.file.buffer.toString('base64')}`;
            const result = await cloudinary.uploader.upload(fileStr, {
                folder: 'gymrats_feed_posts',
                transformation: [{ quality: "auto" }] // Otimiza a imagem
            });
            imageUrl = result.secure_url;
        }

        const newPost = new Post({
            user: req.user.id,
            text,
            imageUrl
        });

        await newPost.save();

        // Retorna o post recém-criado com os dados do usuário populados
        const populatedPost = await Post.findById(newPost._id).populate('user', 'username profilePicture');

        res.status(201).json(populatedPost);

    } catch (error) {
        console.error("Erro ao criar post:", error);
        res.status(500).json({ message: 'Erro ao criar post.' });
    }
});

module.exports = router;