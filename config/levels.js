// config/levels.js

// Adicionamos 'borderColor' e 'mascotImageUrl' para cada nível.
const LEVELS = [
    { name: 'Ratinho de Academia', minXp: 0,    borderColor: '#9E9E9E', mascotImageUrl: 'https://i.imgur.com/qGk3b2M.png' }, // Cinza - Rato pequeno
    { name: 'Rato de Academia',    minXp: 200,   borderColor: '#FFFFFF', mascotImageUrl: 'https://i.imgur.com/nN0j5vL.png' }, // Branco - Rato mais forte
    { name: 'Rato Marombeiro',     minXp: 500,   borderColor: '#4CAF50', mascotImageUrl: 'https://i.imgur.com/u8412J4.png' }, // Verde - Rato musculoso
    { name: 'Gorila de Academia',  minXp: 1000,  borderColor: '#2196F3', mascotImageUrl: 'https://i.imgur.com/x5S2b1L.png' }, // Azul - Gorila
    { name: 'Monstro da Jaula',    minXp: 2000,  borderColor: '#9C27B0', mascotImageUrl: 'https://res.cloudinary.com/djxml4nsx/image/upload/v1750468704/gymrats_feed_posts/nvxynlzjxtctihjudrsh.png' }, // Roxo - Monstro
    { name: 'Lenda do Ginásio',    minXp: 5000,  borderColor: '#FFD700', mascotImageUrl: 'https://i.imgur.com/sT8s3cK.png' }  // Dourado - Lenda
];

// A função getLevelInfo não precisa de alterações, pois ela já retorna o objeto 'currentLevel' completo.
function getLevelInfo(userXp) {
    let currentLevel = LEVELS[0];
    let nextLevel = null;

    for (let i = LEVELS.length - 1; i >= 0; i--) {
        if (userXp >= LEVELS[i].minXp) {
            currentLevel = LEVELS[i];
            if (i < LEVELS.length - 1) {
                nextLevel = LEVELS[i + 1];
            }
            break;
        }
    }

    return {
        currentLevel,
        nextLevel,
    };
}

module.exports = { getLevelInfo };