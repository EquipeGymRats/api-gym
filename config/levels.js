// config/levels.js
const LEVELS = [
    { name: 'Ratinho de Academia', minXp: 0 },
    { name: 'Rato de Academia', minXp: 200 },
    { name: 'Rato Marombeiro', minXp: 500 },
    { name: 'Gorila de Academia', minXp: 1000 },
    { name: 'Monstro da Jaula', minXp: 2000 },
    { name: 'Lenda do Ginásio', minXp: 5000 }
];

// Função que calcula o nível atual e o progresso para o próximo
function getLevelInfo(userXp) {
    let currentLevel = LEVELS[0];
    let nextLevel = null;
    let progressPercentage = 100;

    for (let i = LEVELS.length - 1; i >= 0; i--) {
        if (userXp >= LEVELS[i].minXp) {
            currentLevel = LEVELS[i];
            if (i < LEVELS.length - 1) {
                nextLevel = LEVELS[i + 1];
                const xpForThisLevel = currentLevel.minXp;
                const xpForNextLevel = nextLevel.minXp;
                const totalXpNeededForNext = xpForNextLevel - xpForThisLevel;
                const xpGainedInThisLevel = userXp - xpForThisLevel;
                progressPercentage = Math.min((xpGainedInThisLevel / totalXpNeededForNext) * 100, 100);
            }
            break;
        }
    }

    return {
        currentLevel,
        nextLevel,
        progressPercentage: Math.round(progressPercentage)
    };
}

module.exports = { getLevelInfo };