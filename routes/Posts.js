// routes/posts.js

const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/auth');
const Post = require('../models/Post');
const multer = require('multer');
const cloudinary = require('cloudinary').v2;
const sanitizeHtml = require('sanitize-html');
const adminAuth = require('../middleware/admin'); // Certifique-se que o middleware de admin está importado
const { getLevelInfo } = require('../config/levels'); // <<< PASSO 1: Importar a função

const allowedMimeTypes = [
    'image/jpeg', 
    'image/png', 
    'image/webp', 
    'image/gif',
    'image/heic', // Formato de iPhones
    'image/heif'  // Formato de iPhones
];

// Cria a configuração do Multer
const upload = multer({
    // 1. Armazenamento: usar memória é correto para o seu caso, 
    // pois você envia o arquivo diretamente para o Cloudinary.
    storage: multer.memoryStorage(),

    // 2. Limites: define um limite de tamanho para evitar que arquivos muito grandes
    // sobrecarreguem o servidor.
    limits: {
        fileSize: 10 * 1024 * 1024 // Limite de 10 Megabytes
    },

    // 3. Filtro de Arquivo: a lógica principal de validação.
    fileFilter: (req, file, cb) => {
        // Verifica se o MIME type do arquivo está na lista de tipos permitidos
        if (allowedMimeTypes.includes(file.mimetype)) {
            // Se estiver, permite o upload
            cb(null, true);
        } else {
            // Se não estiver, rejeita o arquivo e envia uma mensagem de erro
            cb(new Error('Tipo de arquivo não suportado! Apenas imagens são permitidas.'), false);
        }
    }
});


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
            // <<< PASSO 2: Adicionar 'xp' ao populate para termos acesso ao nível >>>
            .populate('user', 'username profilePicture role xp')
            .lean();
        
        // <<< PASSO 3: Adicionar a informação de nível a cada usuário do post >>>
        posts.forEach(post => {
            if (post.user && post.user.xp !== undefined) {
                post.user.levelInfo = getLevelInfo(post.user.xp);
            }
        });
        
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
    const sanitizedText = sanitizeHtml(req.body.text, {
        allowedTags: [],
        allowedAttributes: {},
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
                format: 'webp',
                transformation: [
                    { width: 1080, crop: "limit" }, 
                    { quality: "auto" }
                ]
            });
            imageUrl = result.secure_url;
        }

        const newPost = new Post({
            user: req.user.id,
            text: sanitizedText,
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

router.delete('/:id', authMiddleware, adminAuth, async (req, res) => {
    try {
        const post = await Post.findById(req.params.id);

        if (!post) {
            return res.status(404).json({ message: 'Post não encontrado.' });
        }

        if (post.imageUrl) {
            const publicId = post.imageUrl.split('/').slice(-2).join('/').split('.')[0];
            
            await cloudinary.uploader.destroy(publicId);
            console.log(`Imagem deletada do Cloudinary: ${publicId}`);
        }

        await Post.findByIdAndDelete(req.params.id);

        res.json({ message: 'Post deletado com sucesso.' });

    } catch (error) {
        console.error('Erro ao deletar post:', error);
        res.status(500).json({ message: 'Erro no servidor ao deletar o post.' });
    }
});



module.exports = router;