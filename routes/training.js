// routes/training.js
const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/auth'); // Middleware de autenticação
const Training = require('../models/Training'); // Importa o modelo de Treino
const { GoogleGenerativeAI, HarmBlockThreshold, HarmCategory } = require('@google/generative-ai');

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

module.exports = router;