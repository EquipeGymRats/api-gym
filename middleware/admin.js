// middleware/adminAuth.js
const adminAuth = (req, res, next) => {
     if (!req.user || req.user.role !== 'admin') {
        return res.status(403).json({ message: 'Acesso negado: Apenas administradores podem acessar esta rota.' });
    }
    next();
};

module.exports = adminAuth;