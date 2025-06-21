// routes/posts.js

const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/auth');
const Post = require('../models/Post');
const multer = require('multer');
const cloudinary = require('cloudinary').v2;
const sanitizeHtml = require('sanitize-html');
const adminAuth = require('../middleware/admin'); // Certifique-se que o middleware de admin está importado

const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

// Rota para buscar todos os posts do feed (mais recentes primeiro)
router.get('/', authMiddleware, async (req, res) => {
    try {
        const page = parseInt(req.query.page, 10) || 1;
        const limit = parseInt(req.query.limit, 10) || 5;
        const skip = (page - 1) * limit;

        const totalPosts = await Post.countDocuments();

        const posts = await Post.find()
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit)
            // <<< MUDANÇA AQUI: Adicionado 'role' ao populate >>>
            .populate('user', 'username profilePicture role')
            .lean();
        
        res.json({
            posts,
            totalPages: Math.ceil(totalPosts / limit),
            currentPage: page
        });

    } catch (error) {
        console.error('Erro ao buscar posts:', error);
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

router.delete('/:id', authMiddleware, adminAuth, async (req, res) => {
    try {
        const post = await Post.findById(req.params.id);

        if (!post) {
            return res.status(404).json({ message: 'Post não encontrado.' });
        }

        // Se o post tiver uma imagem no Cloudinary, delete-a
        if (post.imageUrl) {
            // Extrai o public_id da URL da imagem
            // Ex: "https://.../gymrats_feed_posts/public_id.webp" -> "gymrats_feed_posts/public_id"
            const publicId = post.imageUrl.split('/').slice(-2).join('/').split('.')[0];
            
            await cloudinary.uploader.destroy(publicId);
            console.log(`Imagem deletada do Cloudinary: ${publicId}`);
        }

        // Deleta o post do banco de dados
        await Post.findByIdAndDelete(req.params.id);

        res.json({ message: 'Post deletado com sucesso.' });

    } catch (error) {
        console.error('Erro ao deletar post:', error);
        res.status(500).json({ message: 'Erro no servidor ao deletar o post.' });
    }
});


module.exports = router;