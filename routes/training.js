// routes/training.js
const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/auth'); // Middleware de autenticação
const Training = require('../models/Training'); // Importa o modelo de Treino
const { GoogleGenerativeAI, HarmBlockThreshold, HarmCategory } = require('@google/generative-ai');

// Rota para salvar ou atualizar o treino
router.post('/', authMiddleware, async (req, res) => {
    const { level, objective, frequency, equipment, timePerSession, plan } = req.body;
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
            training.plan = plan;
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
                dateGenerated: new Date()
            });
        }

        await training.save();
        res.status(200).json({ message: 'Treino salvo com sucesso!', training });

    } catch (error) {
        console.error('Erro ao salvar treino:', error);
        res.status(500).json({ message: 'Erro ao salvar o treino.' });
    }
});

// Rota para buscar o treino do usuário
router.get('/', authMiddleware, async (req, res) => {
    const userId = req.user.id; // ID do usuário autenticado

    try {
        const training = await Training.findOne({ user: userId });

        if (!training) {
            return res.status(404).json({ message: 'Nenhum treino encontrado para este usuário.' });
        }

        res.status(200).json(training);

    } catch (error) {
        console.error('Erro ao buscar treino:', error);
        res.status(500).json({ message: 'Erro ao buscar o treino.' });
    }
});

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

router.post('/generate-training-plan', authMiddleware, async (req, res) => {
    const { level, objective, frequency, equipment, timePerSession } = req.body;

    if (!level || !objective || !frequency || !equipment || !timePerSession) {
        return res.status(400).json({ message: 'Todos os campos são obrigatórios para gerar o treino.' });
    }

    try {
        const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

        const prompt = `Como um personal trainer experiente, crie um plano de treino semanal detalhado e personalizado para um indivíduo com as seguintes características:
        - Nível de experiência: ${level}
        - Objetivo principal: ${objective}
        - Frequência semanal: ${frequency} vezes por semana
        - Equipamentos disponíveis: ${equipment}
        - Tempo por sessão: ${timePerSession} minutos

        O plano deve ser formatado como um objeto JSON, onde a chave principal é "plan" e o valor é um array de objetos. Cada objeto no array representa um dia da semana (Segunda-feira a Domingo) e deve conter:
        - "dayName": O nome do dia da semana (ex: "Segunda-feira", "Terça-feira", "Dia de Descanso").
        - "exercises": Um array de objetos, onde cada objeto representa um exercício.
            - Para cada exercício, inclua:
                - "name": Nome do exercício.
                - "setsReps": Número de séries e repetições (ex: "3 séries de 10-12 repetições").
                - "tips": Uma dica curta e útil para a execução do exercício.
                - "videoId": Um ID único para o vídeo tutorial (use o formato: "video_[nome-do-exercicio]", ex: "video_agachamento_livre").
                - "youtubeUrl": Um link para um vídeo tutorial do YouTube que demonstre corretamente a execução do exercício.
                - "muscleGroups": Array com os principais grupos musculares trabalhados (ex: ["quadríceps", "glúteos"]).
                - "difficulty": Nível de dificuldade do exercício em uma escala de 1 a 5.
                - "tutorialSteps": Array com 3-4 passos curtos para executar o exercício corretamente.

        Se o dia for de descanso, o array "exercises" deve estar vazio, e o "dayName" deve indicar o dia da semana normal (ex: "Quarta-feira").

        Exemplo de formato para um dia de treino:
        {
            "dayName": "Segunda-feira",
            "exercises": [
                {
                    "name": "Agachamento Livre",
                    "setsReps": "4 séries de 8-10 repetições",
                    "tips": "Mantenha a postura ereta e o abdômen contraído.",
                    "videoId": "video_agachamento_livre",
                    "youtubeUrl": "https://www.youtube.com/watch?v=aclHkVaku9U",
                    "muscleGroups": ["quadríceps", "glúteos", "isquiotibiais"],
                    "difficulty": 3,
                    "tutorialSteps": [
                        "Posicione os pés na largura dos ombros",
                        "Desça como se fosse sentar em uma cadeira",
                        "Mantenha o peito erguido e olhar à frente",
                        "Empurre através dos calcanhares para subir"
                    ]
                },
                {
                    "name": "Supino com Halteres",
                    "setsReps": "3 séries de 10-12 repetições",
                    "tips": "Controle a descida e subida do movimento.",
                    "videoId": "video_supino_halteres",
                    "youtubeUrl": "https://www.youtube.com/watch?v=VmB1G1K7v94",
                    "muscleGroups": ["peitoral", "tríceps", "ombros"],
                    "difficulty": 2,
                    "tutorialSteps": [
                        "Deite-se no banco com um halter em cada mão",
                        "Posicione os halteres ao lado do peito",
                        "Empurre para cima até os braços estenderem",
                        "Desça lentamente até a posição inicial"
                    ]
                }
            ]
        }

        Exemplo de formato para um dia de descanso:
        {
            "dayName": "Quarta-feira",
            "exercises": []
        }

        Certifique-se de que o JSON seja válido e que não haja nenhum texto antes ou depois do objeto JSON. A resposta deve ser APENAS o JSON. Adapte os exercícios e a intensidade ao nível, objetivo e tempo por sessão. Se a frequência for menor que 7 dias, distribua os treinos de forma lógica e marque os dias restantes como dias de descanso (exercises: []). Inclua pelo menos 4-6 exercícios por dia de treino.

        Para cada exercício, forneça dicas específicas e úteis que realmente ajudem o usuário a executar o movimento corretamente. Os passos do tutorial devem ser claros, concisos e em ordem lógica. Certifique-se de que os exercícios sejam adequados para o nível de experiência e equipamentos disponíveis.

        IMPORTANTE: Para cada exercício, inclua um link real do YouTube (youtubeUrl) que demonstre corretamente a execução do exercício. Os links devem ser de vídeos existentes, curtos (preferencialmente menos de 2 minutos) e que mostrem claramente a técnica correta.
        `;

        const result = await model.generateContent(prompt);
        const response = await result.response;
        let jsonResponse = response.text().trim();

        // Tenta limpar o JSON se a IA incluir caracteres extras
        if (jsonResponse.startsWith('```json')) {
            jsonResponse = jsonResponse.substring(7);
        }
        if (jsonResponse.endsWith('```')) {
            jsonResponse = jsonResponse.slice(0, -3);
        }

        let parsedData;
        try {
            parsedData = JSON.parse(jsonResponse);
        } catch (jsonError) {
            console.error("Erro ao fazer parse do JSON retornado pela Gemini (Treino):", jsonError);
            console.error("Texto da resposta que tentou parsear (Treino):", jsonResponse);
            return res.status(500).json({ error: "A IA gerou uma resposta para o treino, mas não foi possível fazer parse do JSON válido." });
        }

        if (!parsedData || !Array.isArray(parsedData.plan)) {
            throw new Error("A resposta da IA para o treino não contém um array 'plan' válido no formato esperado.");
        }

        // Garante que o plano tenha 7 dias, preenchendo com dias de descanso se necessário
        const dayNames = ["Segunda-feira", "Terça-feira", "Quarta-feira", "Quinta-feira", "Sexta-feira", "Sábado", "Domingo"];
        if (parsedData.plan.length < 7) {
            console.warn(`A Gemini gerou ${parsedData.plan.length} dias de treino, esperava 7. Completando os dias restantes com descanso.`);
            const existingDays = parsedData.plan.map(day => day.dayName);
            dayNames.forEach(dayName => {
                if (!existingDays.includes(dayName)) {
                    parsedData.plan.push({
                        dayName: dayName,
                        exercises: []
                    });
                }
            });
            // Ordena os dias para garantir a ordem correta
            parsedData.plan.sort((a, b) => dayNames.indexOf(a.dayName) - dayNames.indexOf(b.dayName));
        }

        // Adiciona campo para indicar se há vídeos disponíveis
        parsedData.videosAvailable = true; // Agora temos vídeos do YouTube disponíveis
        
        // Adiciona campo para recomendações gerais baseadas no objetivo
        const recommendationsByObjective = {
            'hipertrofia': [
                "Mantenha um déficit calórico moderado de 300-500 calorias por dia",
                "Consuma 1.6-2.2g de proteína por kg de peso corporal",
                "Priorize o descanso adequado entre as séries (60-90 segundos)",
                "Foque na contração muscular e não apenas em levantar peso"
            ],
            'perda de peso': [
                "Mantenha um déficit calórico moderado de 300-500 calorias por dia",
                "Consuma 1.8-2.2g de proteína por kg de peso corporal para preservar massa muscular",
                "Adicione exercícios cardiovasculares nos dias de descanso",
                "Priorize alimentos integrais e com alto teor de fibras para maior saciedade"
            ],
            'resistencia': [
                "Consuma carboidratos complexos antes dos treinos para energia sustentada",
                "Mantenha-se bem hidratado antes, durante e após os treinos",
                "Aumente gradualmente o volume de treino a cada 2-3 semanas",
                "Inclua exercícios cardiovasculares de baixa intensidade nos dias de descanso"
            ],
            'forca': [
                "Consuma 1.8-2.2g de proteína por kg de peso corporal",
                "Priorize descanso adequado entre séries (2-5 minutos)",
                "Foque em exercícios compostos com cargas progressivas",
                "Garanta 7-9 horas de sono para recuperação muscular e neural"
            ]
        };
        
        parsedData.recommendations = recommendationsByObjective[objective] || [
            "Mantenha uma alimentação balanceada com proteínas, carboidratos e gorduras saudáveis",
            "Hidrate-se adequadamente antes, durante e após os treinos",
            "Respeite os dias de descanso para recuperação muscular",
            "Aumente gradualmente a intensidade dos exercícios conforme sua evolução"
        ];

        res.json(parsedData);

    } catch (error) {
        console.error('Erro ao gerar plano de treino na Gemini API:', error);
        res.status(500).json({ error: 'Erro ao gerar plano de treino. Tente novamente mais tarde.' });
    }
});



module.exports = router;