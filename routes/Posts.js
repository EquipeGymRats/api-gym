// routes/posts.js

const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/auth');
const Post = require('../models/Post');
const multer = require('multer');
const cloudinary = require('cloudinary').v2;
const sanitizeHtml = require('sanitize-html');

const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

// Rota para buscar todos os posts do feed (mais recentes primeiro)
router.get('/', authMiddleware, async (req, res) => {
    try {
        const posts = await Post.find()
            .sort({ createdAt: -1 })
            .populate('user', 'username profilePicture');

        res.json(posts);
    } catch (error) {
        res.status(500).json({ message: 'Erro ao buscar posts.' });
    }
});


// Rota para criar um novo post
router.post('/', authMiddleware, upload.single('postImage'), async (req, res) => {
    // <<< INÍCIO DA MODIFICAÇÃO >>>
    // Sanitiza o texto, permitindo apenas tags seguras (nenhuma por padrão)
    const sanitizedText = sanitizeHtml(req.body.text, {
        allowedTags: [], // Nenhuma tag HTML é permitida
        allowedAttributes: {}, // Nenhum atributo é permitido
    });

    if (!sanitizedText) {
        return res.status(400).json({ message: 'O texto do post é obrigatório.' });
    }

    try {
        let imageUrl = '';
        if (req.file) {
            const fileStr = `data:${req.file.mimetype};base64,${req.file.buffer.toString('base64')}`;
            const result = await cloudinary.uploader.upload(fileStr, {
                folder: 'gymrats_feed_posts',
                transformation: [{ quality: "auto" }]
            });
            imageUrl = result.secure_url;
        }

        const newPost = new Post({
            user: req.user.id,
            text: sanitizedText, // <<< USE O TEXTO SANITIZADO
            imageUrl
        });

        await newPost.save();

        const populatedPost = await Post.findById(newPost._id).populate('user', 'username profilePicture');

        res.status(201).json(populatedPost);

    } catch (error) {
        console.error("Erro ao criar post:", error);
        res.status(500).json({ message: 'Erro ao criar post.' });
    }
});


module.exports = router;