// routes/training.js
const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/auth'); // Middleware de autenticação
const Training = require('../models/Training'); // Importa o modelo de Treino
const User = require('../models/User'); // <<< ADICIONE ESTA LINHA
const WorkoutLog = require('../models/WorkoutLog'); // Importe o novo modelo
const { GoogleGenerativeAI, HarmBlockThreshold, HarmCategory } = require('@google/generative-ai');
const mongoose = require('mongoose');
const crypto = require('crypto');
const Achievement = require('../models/Achievement'); // Adicione este import

// Função auxiliar para verificar e conceder conquistas


// Configuração da Gemini API (se estiver faltando, adicione aqui)
const API_KEY = process.env.GEMINI_API_KEY; // Certifique-se de que a API_KEY está definida como variável de ambiente
const genAI = new GoogleGenerativeAI(API_KEY);
const model = genAI.getGenerativeModel({model: "gemini-1.5-flash" });

async function checkAndAwardAchievements(userId) {
    const user = await User.findById(userId).populate('unlockedAchievements.achievementId');
    const allAchievements = await Achievement.find();

    const unlockedIds = new Set(user.unlockedAchievements.map(ua => ua.achievementId._id.toString()));

    for (const ach of allAchievements) {
        if (!unlockedIds.has(ach._id.toString())) {
            let unlock = false;
            if (ach.criteria.type === 'level' && user.xp >= ach.criteria.value) {
                unlock = true;
            }
            // Adicione aqui outras lógicas, como 'totalWorkouts' e 'streak'
            // if (ach.criteria.type === 'totalWorkouts' && totalWorkouts >= ach.criteria.value) { ... }
            
            if (unlock) {
                user.unlockedAchievements.push({ achievementId: ach._id });
            }
        }
    }
    await user.save();
}

router.get('/today', authMiddleware, async (req, res) => {
    try {
        // 1. Encontra o usuário para obter o ID do treino ativo
        const user = await User.findById(req.user.id);
        if (!user || !user.currentTrainingId) {
            return res.status(404).json({ message: 'Plano de treino ativo não encontrado.' });
        }

        // 2. Busca o plano de treino ativo usando o ID armazenado no usuário
        const trainingPlan = await Training.findById(user.currentTrainingId).lean();

        if (!trainingPlan || !trainingPlan.plan || trainingPlan.plan.length === 0) {
            // Mensagem caso o treino ativo exista mas esteja vazio
            return res.status(404).json({ message: 'Seu plano de treino ativo está vazio.' });
        }

        // 3. Encontra o nome do dia da semana atual
        const dayNames = ["domingo", "segunda-feira", "terça-feira", "quarta-feira", "quinta-feira", "sexta-feira", "sábado"];
        const todayName = dayNames[new Date().getDay()];

        // 4. Localiza o treino de hoje no plano
        const todayWorkout = trainingPlan.plan.find(day => day.dayName.toLowerCase() === todayName);
        
        // 5. Verifica se hoje é um dia de treino ou de descanso
        if (todayWorkout && todayWorkout.exercises && todayWorkout.exercises.length > 0) {
            
            // 6. Verifica se este treino específico já foi logado HOJE
            const today = new Date();
            today.setHours(0, 0, 0, 0); // Zera o tempo para comparar apenas a data

            const log = await WorkoutLog.findOne({
                user: req.user.id,
                trainingId: trainingPlan._id, // <-- FILTRO CRUCIAL: usa o ID do treino ativo
                trainingDayName: todayWorkout.dayName,
                dateCompleted: { $gte: today }
            });

            // Adiciona a flag 'isCompleted' ao objeto do treino
            todayWorkout.isCompleted = !!log; // Converte o resultado para booleano

            res.json({
                objective: trainingPlan.objective,
                workout: todayWorkout // O objeto de treino agora contém o status de conclusão correto
            });

        } else {
            // Resposta para dia de descanso
            res.json({ 
                isRestDay: true,
                message: 'Hoje é seu dia de descanso. Aproveite para recarregar!' 
            });
        }

    } catch (err) {
        res.status(500).send('Erro no Servidor');
    }
});

router.post('/', authMiddleware, async (req, res) => {
    // Recebe os dados e a assinatura de integridade do frontend
    const { level, objective, frequency, equipment, timePerSession, plan, recommendations, signature } = req.body;
    const userId = req.user.id;

    // 1. Verificação de integridade (como estava antes, está correto)
    if (!signature) {
        return res.status(400).json({ error: 'Assinatura de integridade ausente.' });
    }
    const planString = JSON.stringify(plan);
    const expectedSignature = crypto
        .createHmac('sha256', process.env.INTEGRITY_SECRET)
        .update(planString)
        .digest('hex');

    // Compara as assinaturas de forma segura
    if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature))) {
        return res.status(403).json({ error: 'Falha na verificação de integridade. O plano pode ter sido alterado.' });
    }

    // Se a assinatura for válida, o processo continua...
    try {
        // 2. Cria o novo documento de treino na coleção 'trainings'
        const newTraining = new Training({
            user: userId,
            level,
            objective,
            frequency,
            equipment,
            timePerSession,
            plan,
            recommendations,
            dateGenerated: new Date()
        });
        await newTraining.save();

        // --- INÍCIO DA CORREÇÃO ---
        // 3. Atualiza o documento do usuário na coleção 'users'
        //    Definindo o 'currentTrainingId' para o ID do treino que acabamos de criar.
        await User.findByIdAndUpdate(userId, { currentTrainingId: newTraining._id });
        
        // --- FIM DA CORREÇÃO ---

        // 4. Retorna a resposta de sucesso
        res.status(201).json({ message: 'Treino salvo e definido como ativo com sucesso!', training: newTraining });

    } catch (error) {
        if (error.name === 'ValidationError') {
            const errors = Object.values(error.errors).map(e => e.message);
            return res.status(400).json({ error: 'Dados inválidos.', details: errors });
        }
        res.status(500).json({ error: 'Erro interno ao salvar o treino.' });
    }
});

// Rota para carregar o treino salvo do usuário
router.get('/', authMiddleware, async (req, res) => {
    const userId = req.user.id;
    try {
        const user = await User.findById(userId);
        if (!user || !user.currentTrainingId) {
            return res.status(404).json({ message: 'Nenhum treino ativo encontrado para este usuário.' });
        }

        const activeTraining = await Training.findById(user.currentTrainingId).lean();
        if (!activeTraining) {
            return res.status(404).json({ message: 'O treino ativo não foi encontrado.' });
        }

        // Busca logs APENAS para o treino ativo
        const logs = await WorkoutLog.find({ user: userId, trainingId: activeTraining._id });
        const completedTodaySet = new Set();
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        logs.forEach(log => {
            const logDate = new Date(log.dateCompleted);
            logDate.setHours(0, 0, 0, 0);
            if (logDate.getTime() === today.getTime()) {
                completedTodaySet.add(log.trainingDayName);
            }
        });

        activeTraining.plan.forEach(day => {
            day.isCompleted = completedTodaySet.has(day.dayName);
        });

        res.status(200).json(activeTraining);


    } catch (error) {
        res.status(500).json({ error: 'Erro ao carregar treino. Tente novamente mais tarde.' });
    }
});

// Rota para gerar o treino com a Gemini API
router.post('/generate-treino', authMiddleware, async (req, res) => {
    const { level, objective, frequency, equipment, timePerSession } = req.body;

    const model = genAI.getGenerativeModel({
        model: "gemini-1.5-flash",
        generationConfig: {
            responseMimeType: "application/json",
            responseSchema: {
                type: "object",
                properties: {
                    plan: {
                        type: "array",
                        items: {
                            type: "object",
                            properties: {
                                dayName: { type: "string" },
                                exercises: {
                                    type: "array",
                                    items: {
                                        type: "object",
                                        properties: {
                                            name: { type: "string" },
                                            exerciseId: { type: "string", description: "Identificador único no formato 'grupomuscular_nome_equipamento'." },
                                            setsReps: { type: "string" },
                                            tips: { type: "string", description: "Uma dica curta e útil sobre a execução." },
                                            muscleGroups: { type: "array", items: { type: "string" } },
                                            difficulty: { type: "number", description: "Nível de 1 (fácil) a 5 (difícil)." },
                                            tutorialSteps: { type: "array", items: { type: "string" } }
                                        },
                                        required: ["name", "exerciseId", "setsReps", "tips", "muscleGroups", "difficulty", "tutorialSteps"]
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    });

    const prompt = `
        Você é um Personal Trainer especialista. Crie um plano de treino semanal em JSON.

        Para cada exercício, forneça OBRIGATORIAMENTE os seguintes campos:
        - "name": Nome do exercício.
        - "exerciseId": Identificador único no formato 'grupomuscular_nome_equipamento' (ex: 'peito_supino_reto_barra').
        - "setsReps": Séries e repetições (ex: "4 séries de 10 reps").
        - "tips": Uma dica curta e crucial para a boa execução.
        - "muscleGroups": Um array com os principais músculos trabalhados.
        - "difficulty": Um número de 1 a 5 para a dificuldade.
        - "tutorialSteps": Um array com 3 ou 4 passos simples para realizar o exercício.

        Detalhes do usuário:
        - Nível: ${level}
        - Objetivo: ${objective}
        - Frequência: ${frequency} dias
        - Equipamento: ${equipment}
        - Tempo por Sessão: ${timePerSession} minutos

        A resposta DEVE ser um único bloco de código JSON válido.
    `;

    try {
        const result = await model.generateContent(prompt);
        const response = await result.response;
        const parsedData = JSON.parse(response.text());

        // <<< 2. GERAR A ASSINATURA AQUI
        // É crucial assinar o objeto exato que será salvo (o 'plan')
        const planString = JSON.stringify(parsedData.plan);
        const signature = crypto
            .createHmac('sha256', process.env.INTEGRITY_SECRET)
            .update(planString)
            .digest('hex');

        const finalResponse = {
            level, objective, frequency, equipment, timePerSession,
            ...parsedData,
            signature // <<< 3. ENVIAR A ASSINATURA PARA O FRONTEND
        };

        res.json(finalResponse);

    } catch (error) {
        // Implementar a extração de JSON robusta que discutimos anteriormente
        // para evitar erros de parse.
        res.status(500).json({ message: 'Erro ao gerar o treino.' });
    }
});

// Rotas dashboard para treinos

router.post('/complete-day', authMiddleware, async (req, res) => {
    const { dayName } = req.body;
    const userId = req.user.id;

    if (!dayName) {
        return res.status(400).json({ message: 'O nome do dia de treino é obrigatório.' });
    }

    try {

        // 1. Encontra o usuário e o treino ativo
        const user = await User.findById(userId);
        if (!user || !user.currentTrainingId) {
            return res.status(400).json({ message: 'Nenhum treino ativo encontrado para registrar o progresso.' });
        }
        
        const activeTrainingId = user.currentTrainingId;

        // 2. Garante que o log para este dia e treino específico ainda não foi feito hoje
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const existingLogToday = await WorkoutLog.findOne({
            user: userId,
            trainingId: activeTrainingId,
            trainingDayName: dayName,
            dateCompleted: { $gte: today }
        });

        if (existingLogToday) {
            return res.status(409).json({ message: 'Este treino já foi concluído hoje.' });
        }

        // 3. Salva o novo log
        const newLog = new WorkoutLog({
            user: userId,
            trainingId: activeTrainingId,
            trainingDayName: dayName,
            dateCompleted: new Date()
        });
        await newLog.save();

        // --- LÓGICA DE XP E CONCLUSÃO DE SEMANA ---
        const userTrainingPlan = await Training.findById(activeTrainingId);
        if (!userTrainingPlan || !userTrainingPlan.plan) {
            return res.status(200).json({ message: `Treino '${dayName}' concluído!`, weekCompleted: false, gainedXp: 10 });
        }
        
        const dayPlan = userTrainingPlan.plan.find(d => d.dayName === dayName);
        const dailyXp = (!dayPlan || !dayPlan.exercises || dayPlan.exercises.length === 0) ? 0 : 10;

        // --- INÍCIO DA CORREÇÃO ---
        // Garante que o ID é um ObjectId antes de usar na consulta 'distinct'
        const trainingObjectId = new mongoose.Types.ObjectId(activeTrainingId);
        const completedDayNames = await WorkoutLog.distinct('trainingDayName', {
            user: userId,
            trainingId: trainingObjectId // Usando o ObjectId garantido
        });
        // --- FIM DA CORREÇÃO ---
        
        
        const totalWeeklyWorkouts = userTrainingPlan.plan.filter(d => d.exercises && d.exercises.length > 0).length;
        
        let weeklyBonusXp = 0;
        let weekCompleted = false;

        if (completedDayNames.length >= totalWeeklyWorkouts) {
            weekCompleted = true;
            weeklyBonusXp = 50;
        }

        const totalXpGained = dailyXp + weeklyBonusXp;
        if (totalXpGained > 0) {
            await User.findByIdAndUpdate(userId, { $inc: { xp: totalXpGained } });
        }

        // 7. Envia a resposta final para o frontend
        const responsePayload = {
            message: weekCompleted ? "Parabéns! Você concluiu todos os dias deste treino!" : `Treino '${dayName}' concluído com sucesso!`,
            weekCompleted: weekCompleted,
            gainedXp: totalXpGained
        };
        
        res.status(200).json(responsePayload);

    } catch (error) {
        res.status(500).json({ message: 'Erro no servidor ao salvar o progresso.' });
    }
});



router.get('/logs', authMiddleware, async (req, res) => {
    try {
        const userId = req.user.id;
        // Retorna todos os logs, o frontend pode filtrar/agrupar se necessário
        const logs = await WorkoutLog.find({ user: userId })
            .populate('trainingId', 'dateGenerated objective') // Popula com dados do treino
            .sort({ dateCompleted: -1 });
        res.status(200).json(logs);
    } catch (error) {
        res.status(500).json({ message: 'Erro no servidor ao buscar histórico de treinos.' });
    }
});

const getStartOfWeek = (date) => {
    const d = new Date(date);
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Ajusta para segunda-feira
    return new Date(d.setDate(diff));
};

// Rota principal para buscar todas as estatísticas de progresso
router.get('/stats', authMiddleware, async (req, res) => {
    try {
        const userId = req.user.id;
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        // --- 1. Total de Treinos ---
        const totalWorkouts = await WorkoutLog.countDocuments({ user: userId });

        // --- 2. Sequência Atual (Streak) ---
        const userLogs = await WorkoutLog.find({ user: userId }).sort({ dateCompleted: -1 });
        let currentStreak = 0;
        if (userLogs.length > 0) {
            let lastDate = new Date();
            // Verifica se o último treino foi hoje ou ontem para iniciar a contagem
            const lastLogDate = new Date(userLogs[0].dateCompleted);
            lastLogDate.setHours(0,0,0,0);

            if (lastLogDate.getTime() === today.getTime() || lastLogDate.getTime() === today.getTime() - 86400000) {
                currentStreak = 1;
                lastDate = lastLogDate;

                for (let i = 1; i < userLogs.length; i++) {
                    const currentDate = new Date(userLogs[i].dateCompleted);
                    currentDate.setHours(0,0,0,0);
                    
                    if (lastDate.getTime() - currentDate.getTime() === 86400000) { // Um dia de diferença
                        currentStreak++;
                        lastDate = currentDate;
                    } else if (lastDate.getTime() - currentDate.getTime() > 86400000) {
                        break; // Sequência quebrada
                    }
                }
            }
        }

        // --- 3. Treinos por Semana (Últimas 6 semanas) ---
        const sixWeeksAgo = getStartOfWeek(new Date());
        sixWeeksAgo.setDate(sixWeeksAgo.getDate() - 35); // 5 semanas antes da atual

        const weeklyData = await WorkoutLog.aggregate([
            { $match: { user: new mongoose.Types.ObjectId(userId), dateCompleted: { $gte: sixWeeksAgo } } },
            {
                $group: {
                    _id: { $dateToString: { format: "%Y-%U", date: "$dateCompleted", "timezone": "America/Sao_Paulo" } }, // Agrupa por ano e número da semana
                    count: { $sum: 1 }
                }
            },
            { $sort: { "_id": 1 } }
        ]);

        // --- 4. Frequência por Tipo de Treino (Donut Chart) ---
        const workoutFrequency = await WorkoutLog.aggregate([
            { $match: { user: new mongoose.Types.ObjectId(userId) } },
            { $group: { _id: "$trainingDayName", count: { $sum: 1 } } },
            { $sort: { count: -1 } }
        ]);

        // Envia todos os dados compilados para o frontend
        res.json({
            totalWorkouts,
            currentStreak,
            weeklyData,
            workoutFrequency
        });

    } catch (error) {
        res.status(500).json({ message: "Erro ao buscar estatísticas de progresso." });
    }
});


module.exports = router;