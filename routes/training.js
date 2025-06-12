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

    // Ajuste o prompt para ser mais robusto e específico
   const prompt = `
        Você é um Personal Trainer especialista em musculação e calistenia. Seu objetivo é criar um plano de treino semanal detalhado, focado em atingir os objetivos específicos do usuário, considerando seu nível de experiência, frequência e equipamento disponível.

        O plano deve ser estruturado por dias da semana (Segunda a Domingo).
        Para cada dia de treino, inclua 3-5 exercícios. Se um dia não tiver treino, deixe a lista de exercícios vazia.
        Para cada exercício, forneça os seguintes detalhes em formato JSON:
        - "name": Nome do exercício (string)
        - "setsReps": Séries e repetições (ex: "3 séries de 8-12 repetições", "3 séries de 30-60 segundos") (string)
        - "tips": **Dicas de execução e segurança (curtas e diretas, no máximo 1-2 frases).** (string)
        - "videoId": Um ID único para o vídeo (string, pode ser um placeholder como "video_nome_exercicio")
        - "youtubeUrl": **Uma URL REAL e válida de um vídeo do YouTube que explique o exercício em PORTUGUÊS.** Esta URL deve ser de um vídeo que realmente exista e demonstre o exercício. Exemplo: "https://www.youtube.com/watch?v=EXEMPLO_ID_VIDEO". É CRUCIAL que a URL seja de um vídeo existente e em português.
        - "muscleGroups": Lista de grupos musculares principais trabalhados (array de strings, ex: ["peitoral", "tríceps", "ombros"])
        - "difficulty": Nível de dificuldade de 1 (Muito Fácil) a 5 (Muito Difícil) (número inteiro)
        - "tutorialSteps": Passos detalhados de como executar o exercício (array de strings)

        Forneça também uma propriedade "videosAvailable": true (booleano) para indicar que as URLs de vídeo foram incluídas e são válidas.

        Finalmente, inclua uma seção "recommendations" com 3 a 5 dicas gerais de treino e nutrição que complementem os objetivos do usuário.

        Detalhes do usuário para a geração do treino:
        - Nível de Experiência: ${level}
        - Objetivo Principal: ${objective}
        - Frequência Semanal: ${frequency}
        - Equipamento Disponível: ${equipment} (Se for 'Somente peso corporal', adapte os exercícios para calistenia)
        - Tempo por Sessão: ${timePerSession} minutos

        Exemplo de formato JSON esperado:
        {
            "plan": [
                {
                    "dayName": "Segunda-feira",
                    "exercises": [
                        {
                            "name": "Flexão de Braços",
                            "setsReps": "3 séries de 8-12 repetições",
                            "tips": "Mantenha o corpo reto e controle a descida.",
                            "videoId": "flexao_bracos_video_id",
                            "youtubeUrl": "https://www.youtube.com/watch?v=dQw4w9WgXcQ", // Exemplo de URL de vídeo real
                            "muscleGroups": ["peitoral", "tríceps", "ombros"],
                            "difficulty": 3,
                            "tutorialSteps": [
                                "Deite-se de bruços com as mãos na largura dos ombros.",
                                "Empurre o chão para levantar o tronco, mantendo o corpo alinhado.",
                                "Abaixe lentamente até o peito quase tocar o chão.",
                                "Repita o movimento."
                            ]
                        },
                        // ... outros exercícios
                    ]
                },
                {
                    "dayName": "Terça-feira",
                    "exercises": [] // Dia de descanso ou sem exercícios
                }
                // ... outros dias
            ],
            "videosAvailable": true,
            "recommendations": [
                "Mantenha um déficit calórico moderado de 300-500 calorias por dia para perda de peso.",
                "Consuma 1.6-2.2g de proteína por kg de peso corporal para recuperação e crescimento muscular.",
                "Priorize o descanso adequado entre as séries (60-90 segundos para hipertrofia).",
                "Foque na conexão mente-músculo e na execução correta de cada movimento."
            ]
        }
    `;

    try {
        const generationConfig = {
            temperature: 0.9,
            topK: 1,
            topP: 1,
            maxOutputTokens: 2048,
        };

        const safetySettings = [
            {
                category: HarmCategory.HARM_CATEGORY_HARASSMENT,
                threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
            },
            {
                category: HarmCategory.HARM_CATEGORY_HATE_SPEECH,
                threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
            },
            {
                category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT,
                threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
            },
            {
                category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT,
                threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
            },
        ];

        const chat = model.startChat({
            generationConfig,
            safetySettings,
            history: [],
        });
        
        const result = await chat.sendMessage(prompt);
        let text = result.response.text();

        // Tenta limpar o texto de qualquer markdown de código que a Gemini possa adicionar
        text = text.replace(/```json\s*|```\s*/g, '').trim();

        let parsedData;
        try {
            parsedData = JSON.parse(text);
        } catch (jsonError) {
            console.error('Erro ao parsear JSON da Gemini API:', jsonError);
            console.error('Texto recebido da Gemini:', text);
            return res.status(500).json({ error: 'Formato de resposta inesperado da Gemini API.' });
        }
        
        // Adiciona os parâmetros de entrada de volta ao objeto retornado para o frontend
        parsedData.level = level;
        parsedData.objective = objective;
        parsedData.frequency = frequency;
        parsedData.equipment = equipment;
        parsedData.timePerSession = timePerSession;

        // As recomendações já vêm da IA, não precisamos sobrescrever aqui
        // No seu snippet anterior, você tinha uma lógica para adicionar recomendações baseadas no objetivo.
        // Se você quer que a IA *sempre* forneça as recomendações, remova a lógica abaixo.
        // Se você quer que o backend tenha um fallback ou adicione recomendações específicas, mantenha-a.
        // Pela sua descrição, parece que a IA já está retornando as recomendações no JSON.

        res.json(parsedData);

    } catch (error) {
        console.error('Erro ao gerar plano de treino na Gemini API:', error);
        res.status(500).json({ error: 'Erro ao gerar plano de treino. Tente novamente mais tarde.' });
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