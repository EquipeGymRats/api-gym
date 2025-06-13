// routes/training.js
const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/auth'); // Middleware de autenticação
const Training = require('../models/Training'); // Importa o modelo de Treino
const User = require('../models/User'); // <<< ADICIONE ESTA LINHA
const WorkoutLog = require('../models/WorkoutLog'); // Importe o novo modelo
const { GoogleGenerativeAI, HarmBlockThreshold, HarmCategory } = require('@google/generative-ai');
const mongoose = require('mongoose');

// Configuração da Gemini API (se estiver faltando, adicione aqui)
const API_KEY = process.env.GEMINI_API_KEY; // Certifique-se de que a API_KEY está definida como variável de ambiente
const genAI = new GoogleGenerativeAI(API_KEY);
const model = genAI.getGenerativeModel({model: "gemini-1.5-flash" });

// Rota para salvar ou atualizar o treino
router.post('/', authMiddleware, async (req, res) => {
    // DESESTRUTURAR TUDO QUE PODE VIR DO BODY
    const { level, objective, frequency, equipment, timePerSession, plan, recommendations } = req.body;
    const userId = req.user.id; // ID do usuário autenticado

    try {
        let training = await Training.findOne({ user: userId });

        if (training) {
            // Atualiza o treino existente
            training.level = level;
            training.objective = objective;
            training.frequency = frequency;
            training.equipment = equipment;
            training.timePerSession = timePerSession;
            training.plan = plan; // O plan agora está tipado no schema e será salvo corretamente
            training.recommendations = recommendations; // SALVANDO AS RECOMENDAÇÕES AQUI
            training.dateGenerated = new Date();
        } else {
            // Cria um novo treino
            training = new Training({
                user: userId,
                level,
                objective,
                frequency,
                equipment,
                timePerSession,
                plan,
                recommendations, // CRIANDO E SALVANDO AS RECOMENDAÇÕES AQUI
                dateGenerated: new Date()
            });
        }

        await training.save();
        res.status(200).json({ message: 'Treino salvo com sucesso!', training });
    } catch (error) {
        console.error('Erro ao salvar ou atualizar treino:', error);
        // Adicionar detalhes do erro para depuração
        if (error.name === 'ValidationError') {
            const errors = Object.keys(error.errors).map(key => error.errors[key].message);
            return res.status(400).json({ error: 'Erro de validação ao salvar treino.', details: errors });
        }
        res.status(500).json({ error: 'Erro ao salvar ou atualizar treino. Tente novamente mais tarde.' });
    }
});

// Rota para carregar o treino salvo do usuário
router.get('/', authMiddleware, async (req, res) => {
    const userId = req.user.id; // ID do usuário autenticado

    try {
        const training = await Training.findOne({ user: userId });

        if (training) {
            res.status(200).json(training); // Retorna o objeto de treino completo
        } else {
            res.status(404).json({ message: 'Nenhum treino salvo encontrado para este usuário.' });
        }
    } catch (error) {
        console.error('Erro ao carregar treino:', error);
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

        NÃO inclua o campo 'youtubeUrl'.

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
        
        const finalResponse = {
            level, objective, frequency, equipment, timePerSession,
            ...parsedData
        };

        res.json(finalResponse);

    } catch (error) {
        console.error('Erro ao gerar treino com a Gemini API:', error);
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
        const today = new Date();
        today.setHours(0, 0, 0, 0); // Zera o tempo para comparações de data

        // 1. Garante que o log para este dia ainda não foi feito hoje
        const existingLogToday = await WorkoutLog.findOne({
            user: userId,
            trainingDayName: dayName,
            dateCompleted: { $gte: today }
        });

        if (existingLogToday) {
            return res.status(409).json({ message: 'Este treino já foi concluído hoje.' });
        }
        
        // Salva o novo log
        const newLog = new WorkoutLog({ user: userId, trainingDayName: dayName });
        await newLog.save();

        // 2. Busca o plano de treino completo do usuário
        const userTrainingPlan = await Training.findOne({ user: userId });
        if (!userTrainingPlan || !userTrainingPlan.plan || userTrainingPlan.plan.length === 0) {
            return res.status(201).json({ message: `Treino '${dayName}' concluído!`, allDone: false, weekCompleted: false });
        }
        
        // Lógica de XP diário
        const dayPlan = userTrainingPlan.plan.find(d => d.dayName === dayName);
        const isRestDay = !dayPlan || !dayPlan.exercises || dayPlan.exercises.length === 0;
        let dailyXp = isRestDay ? 0 : 10;

        // 3. Lógica de Verificação Semanal
        const totalWeeklyWorkouts = userTrainingPlan.plan.filter(d => d.exercises && d.exercises.length > 0).length;
        
        // Calcula o início (Segunda) e fim (Domingo) da semana atual
        const firstDayOfWeek = new Date(today);
        const dayIndex = today.getDay(); // 0-Dom, 1-Seg, ..., 6-Sáb
        const diff = today.getDate() - dayIndex + (dayIndex === 0 ? -6 : 1); // Ajusta para segunda-feira
        firstDayOfWeek.setDate(diff);
        const lastDayOfWeek = new Date(firstDayOfWeek);
        lastDayOfWeek.setDate(firstDayOfWeek.getDate() + 7);

        // Conta quantos dias de treino *únicos* foram completados nesta semana
        const completedThisWeekLogs = await WorkoutLog.distinct('trainingDayName', {
            user: userId,
            dateCompleted: { $gte: firstDayOfWeek, $lt: lastDayOfWeek }
        });
        
        let weeklyBonusXp = 0;
        let weekCompleted = false;

        // 4. Verifica se a semana foi concluída
        if (completedThisWeekLogs.length >= totalWeeklyWorkouts) {
            weekCompleted = true;
            weeklyBonusXp = 50; // Recompensa semanal
        }

        // 5. Atualiza o XP do usuário com o total
        const totalXpGained = dailyXp + weeklyBonusXp;
        const user = await User.findByIdAndUpdate(
            userId,
            { $inc: { xp: totalXpGained } },
            { new: true }
        );

        // 6. Envia a resposta final para o frontend
        res.status(200).json({
            message: weekCompleted ? "Semana concluída com sucesso!" : `Treino '${dayName}' concluído!`,
            allDone: !isRestDay, // Animação diária
            weekCompleted: weekCompleted, // Animação semanal
            newXp: user.xp,
            gainedXp: totalXpGained
        });

    } catch (error) {
        console.error('Erro ao marcar treino como concluído:', error);
        res.status(500).json({ message: 'Erro no servidor ao salvar o progresso.' });
    }
});

router.get('/logs', authMiddleware, async (req, res) => {
    try {
        const userId = req.user.id;
        const logs = await WorkoutLog.find({ user: userId }).sort({ dateCompleted: -1 }); // Ordena do mais recente para o mais antigo
        res.status(200).json(logs);
    } catch (error) {
        console.error('Erro ao buscar logs de treino:', error);
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
        console.error("Erro ao buscar estatísticas de progresso:", error);
        res.status(500).json({ message: "Erro ao buscar estatísticas." });
    }
});


module.exports = router;