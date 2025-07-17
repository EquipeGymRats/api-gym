// routes/posts.js

const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/auth');
const Post = require('../models/Post');
const multer = require('multer');
const cloudinary = require('cloudinary').v2;
const sanitizeHtml = require('sanitize-html');
const adminAuth = require('../middleware/admin');
const { getLevelInfo } = require('../config/levels');
const Notification = require('../models/Notification');

const allowedMimeTypes = [
    'image/jpeg', 
    'image/png', 
    'image/webp', 
    'image/gif',
    'image/heic',
    'image/heif'
];

const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 10 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        if (allowedMimeTypes.includes(file.mimetype)) {
            cb(null, true);
        } else {
            cb(new Error('Tipo de arquivo não suportado! Apenas imagens são permitidas.'), false);
        }
    }
});

// Rota para buscar todos os posts
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
            .populate('user', 'username profilePicture role xp')
            .lean();

        const postsWithDetails = posts.map(post => {
            const userId = req.user.id;
            const likes = post.likes || [];
            const comments = post.comments || [];

            return {
                ...post,
                likeCount: likes.length,
                commentCount: comments.length,
                isLiked: likes.some(like => like.equals(userId)),
                likes: [],
                comments: []
            };
        });

        postsWithDetails.forEach(post => {
            if (post.user && post.user.xp !== undefined) {
                post.user.levelInfo = getLevelInfo(post.user.xp);
            }
        });

        res.json({
            posts: postsWithDetails,
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
    // === MELHORIA: Limite de 300 caracteres no post ===
    let sanitizedText = sanitizeHtml(req.body.text, {
        allowedTags: [],
        allowedAttributes: {},
    });

    if (sanitizedText.length > 300) {
        sanitizedText = sanitizedText.substring(0, 300);
    }
    // === FIM DA MELHORIA ===

    if (!sanitizedText) {
        return res.status(400).json({ message: 'O texto do post é obrigatório.' });
    }

    try {
        let imageUrl = '';
        if (req.file) {
            const fileStr = `data:${req.file.mimetype};base64,${req.file.buffer.toString('base64')}`;
            const result = await cloudinary.uploader.upload(fileStr, {
                folder: 'gymrats_feed_posts',
                format: 'webp',
                transformation: [{ width: 1080, crop: "limit" }, { quality: "auto" }]
            });
            imageUrl = result.secure_url;
        }

        const newPost = new Post({
            user: req.user.id,
            text: sanitizedText, // Usa o texto truncado
            imageUrl
        });

        await newPost.save();
        const populatedPost = await Post.findById(newPost._id).populate('user', 'username profilePicture');
        res.status(201).json(populatedPost);
    } catch (error) {
        console.error("Erro ao criar post:", error);
        res.status(500).json({ message: 'Erro ao criar post.', error });
    }
});

// Rota para deletar um post (apenas admin)
router.delete('/:id', authMiddleware, adminAuth, async (req, res) => {
    try {
        const post = await Post.findById(req.params.id);
        if (!post) return res.status(404).json({ message: 'Post não encontrado.' });
        
        if (post.imageUrl) {
            const publicId = post.imageUrl.split('/').slice(-2).join('/').split('.')[0];
            await cloudinary.uploader.destroy(publicId);
        }
        await Notification.deleteMany({ post: post._id });
        await Post.findByIdAndDelete(req.params.id);

        res.json({ message: 'Post deletado com sucesso.' });
    } catch (error) {
        res.status(500).json({ message: 'Erro no servidor ao deletar o post.' });
    }
});


// Rota para Curtir/Descurtir um post
router.post('/:id/like', authMiddleware, async (req, res) => {
    try {
        const post = await Post.findById(req.params.id);
        if (!post) return res.status(404).json({ message: 'Post não encontrado.' });
        
        if (!post.likes) post.likes = [];
        
        const userId = req.user.id;
        const likeIndex = post.likes.findIndex(id => id.equals(userId));
        let isLiked = false;

        if (likeIndex > -1) {
            post.likes.splice(likeIndex, 1);
            await Notification.findOneAndDelete({ sender: userId, post: post._id, type: 'like' });
        } else {
            post.likes.push(userId);
            isLiked = true;
            if (post.user.toString() !== userId) {
                await new Notification({
                    recipient: post.user,
                    sender: userId,
                    post: post._id,
                    type: 'like'
                }).save();
            }
        }
        await post.save();
        res.json({ isLiked, likeCount: post.likes.length });
    } catch (error) {
        console.error("Erro na rota /like:", error);
        res.status(500).json({ message: 'Erro no servidor ao processar a curtida.' });
    }
});


// Rota para Adicionar um comentário
router.post('/:id/comment', authMiddleware, async (req, res) => {
    // === MELHORIA: Limite de 300 caracteres no comentário ===
    let sanitizedText = sanitizeHtml(req.body.text, { allowedTags: ['b', 'i', 'strong'] });
    
    if (sanitizedText.length > 300) {
        sanitizedText = sanitizedText.substring(0, 300);
    }
    // === FIM DA MELHORIA ===

    if (!sanitizedText.trim()) {
        return res.status(400).json({ message: 'O comentário não pode estar vazio.' });
    }

    try {
        const post = await Post.findById(req.params.id);
        if (!post) return res.status(404).json({ message: 'Post não encontrado.' });

        const userId = req.user.id;
        post.comments.push({ user: userId, text: sanitizedText }); // Usa o texto truncado
        await post.save();
        await post.populate({ path: 'comments.user', select: 'username profilePicture' });

        if (post.user.toString() !== userId) {
            await new Notification({
                recipient: post.user,
                sender: userId,
                post: post._id,
                type: 'comment',
                commentText: sanitizedText.substring(0, 50)
            }).save();
        }

        const addedComment = post.comments[post.comments.length - 1];
        res.status(201).json(addedComment);
    } catch (error) {
        console.error('Erro ao adicionar comentário:', error);
        res.status(500).json({ message: 'Erro no servidor ao comentar.' });
    }
});


// Rota para buscar comentários de um post
router.get('/:id/comments', authMiddleware, async (req, res) => {
    try {
        const post = await Post.findById(req.params.id)
            .select('comments')
            .populate('comments.user', 'username profilePicture');
        if (!post) return res.status(404).json({ message: 'Post não encontrado.' });
        res.json(post.comments);
    } catch (error) {
        res.status(500).json({ message: 'Erro ao buscar comentários.' });
    }
});

module.exports = router;