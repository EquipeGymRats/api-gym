// server.js
const { GoogleGenerativeAI, HarmBlockThreshold, HarmCategory } = require('@google/generative-ai');
require('dotenv').config();
const express = require('express');
const cors = require('cors');

const app = express();
const port = 3000;

app.use(cors());
app.use(express.json());

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

app.post('/generate-nutrition-plan', async (req, res) => {
    const { weight, height, age, gender, activityLevel, goal, mealsPerDay, dietType, restrictions } = req.body;

    // --- Cálculo de Calorias no Backend (para passar à IA) ---
    const calculateBMR = (w, h, a, g) => {
        if (g === 'Masculino') {
            return (10 * w) + (6.25 * h) - (5 * a) + 5;
        } else { // Feminino
            return (10 * w) + (6.25 * h) - (5 * a) - 161;
        }
    };

    const calculateTDEE = (bmr, level) => {
        let activityFactor = 1.2;
        switch (level) {
            case 'sedentário': activityFactor = 1.2; break;
            case 'levemente ativo': activityFactor = 1.375; break;
            case 'moderadamente ativo': activityFactor = 1.55; break;
            case 'muito ativo': activityFactor = 1.725; break;
            case 'extremamente ativo': activityFactor = 1.9; break;
        }
        return bmr * activityFactor;
    };

    const bmr = calculateBMR(weight, height, age, gender);
    let tdee = calculateTDEE(bmr, activityLevel);
    let targetCalories = tdee;

    if (goal === 'perda de peso') {
        targetCalories = tdee - 500;
    } else if (goal === 'hipertrofia muscular' || goal === 'ganho de forca') {
        targetCalories = tdee + 300;
    }
    targetCalories = Math.round(targetCalories);
    // --- Fim do Cálculo de Calorias ---

    const model = genAI.getGenerativeModel({
        model: "gemini-1.5-flash", // Mantenha este ou "gemini-1.5-pro"
        safetySettings: [
            {
                category: HarmCategory.HARM_CATEGORY_HARASSMENT,
                threshold: HarmBlockThreshold.BLOCK_NONE,
            },
            {
                category: HarmCategory.HARM_CATEGORY_HATE_SPEECH,
                threshold: HarmBlockThreshold.BLOCK_NONE,
            },
            {
                category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT,
                threshold: HarmBlockThreshold.BLOCK_NONE,
            },
            {
                category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT,
                threshold: HarmBlockThreshold.BLOCK_NONE,
            },
        ],
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
                                dayName: { type: "string", description: "Nome do dia da semana (ex: Segunda-feira)" },
                                meals: {
                                    type: "array",
                                    items: {
                                        type: "object",
                                        properties: {
                                            mealName: { type: "string", description: "Nome da refeição (ex: Café da Manhã)" },
                                            foods: {
                                                type: "array",
                                                items: { type: "string", description: "Descrição do alimento com quantidade e unidade (ex: 100g de frango grelhado)" }
                                            },
                                            // NOVO: Campo para o ícone da refeição
                                            icon: { type: "string", description: "Classe Font Awesome para o ícone da refeição (ex: fas fa-coffee, fas fa-drumstick-bite, fas fa-apple-alt, fas fa-utensils, fas fa-moon). Use icones Font Awesome 6 Free." }
                                        },
                                        required: ["mealName", "foods", "icon"] // icon agora é obrigatório
                                    }
                                }
                            },
                            required: ["dayName", "meals"]
                        }
                    },
                    // NOVO: Campo opcional para dicas gerais do plano
                    tips: {
                        type: "array",
                        items: { type: "string", description: "Dicas importantes sobre o plano alimentar. Mande apenas se houver dicas gerais e relevantes para o usuário." },
                        nullable: true // Indica que este campo pode ser nulo ou ausente
                    }
                },
                required: ["plan"]
            }
        }
    });

       const prompt = `Você é um nutricionista esportivo especializado em planos de alimentação.
    Gere um plano alimentar semanal (7 dias) em Português do Brasil para um indivíduo com as seguintes características:
    - Peso: ${weight} kg
    - Altura: ${height} cm
    - Idade: ${age} anos
    - Gênero: ${gender}
    - Nível de atividade: ${activityLevel}
    - Objetivo: ${goal}
    - Refeições por dia: ${mealsPerDay}
    - Tipo de dieta: ${dietType}
    - Restrições alimentares: ${restrictions || 'Nenhuma'}
    - Calorias diárias estimadas para o objetivo: ${targetCalories} kcal.

    O plano deve ter 7 dias (Segunda-feira a Domingo). Cada dia deve ter ${mealsPerDay} refeições.
    Para cada refeição, liste os alimentos específicos com quantidades em gramas ou unidades.
    **Para cada refeição, inclua no campo "icon" a CLASSE FONT AWESOME 6 FREE mais adequada para o tipo de refeição. Use APENAS UMA dessas classes:**
    - "fas fa-coffee" para Café da Manhã
    - "fas fa-apple-alt" para Lanche da Manhã/Tarde (frutas, snacks leves)
    - "fas fa-utensils" para Almoço/Jantar (refeições principais com talheres)
    - "fas fa-moon" para Ceia (refeição noturna)
    - "fas fa-blender-phone" para Shakes/Vitaminas (se for o caso)
    - "fas fa-egg" para Ovos (se for o foco da refeição)

    **Se houver alguma dica nutricional geral muito importante para o usuário relacionada ao objetivo ou dieta, inclua um array de "tips" no final do JSON. Caso contrário, não inclua o campo "tips".**

    Exemplo de formato para uma refeição (o formato completo está no schema JSON):
    {
      "mealName": "Café da Manhã",
      "foods": [
        "2 ovos mexidos",
        "1 fatia de pão integral (50g)",
        "1/2 abacate (100g)"
      ],
      "icon": "fas fa-coffee" // Exemplo de uso do ícone
    }

    Forneça descrições de alimentos realistas e acessíveis no Brasil. Não inclua informações nutricionais para os alimentos, apenas a descrição e quantidade.
    `;

    console.log("Prompt enviado para Gemini API:", prompt);

    try {
        const result = await model.generateContent(prompt);
        const response = await result.response;
        const jsonResponse = response.text();

        let parsedData;
        try {
            parsedData = JSON.parse(jsonResponse);
            console.log("JSON PARSEADO COM SUCESSO DA GEMINI:", parsedData);
        } catch (jsonError) {
            console.error("Erro ao fazer parse do JSON retornado pela Gemini:", jsonError);
            console.error("Texto da resposta que tentou parsear:", jsonResponse);
            return res.status(500).json({ error: "A IA gerou uma resposta, mas não foi possível fazer parse do JSON válido." });
        }

        if (!parsedData || !Array.isArray(parsedData.plan)) {
            throw new Error("A resposta da IA não contém um array 'plan' válido no formato esperado.");
        }

        const dayNames = ["Segunda-feira", "Terça-feira", "Quarta-feira", "Quinta-feira", "Sexta-feira", "Sábado", "Domingo"];
        if (parsedData.plan.length < 7) {
            console.warn(`A Gemini gerou ${parsedData.plan.length} dias, esperava 7. Completando os dias restantes.`);
            for (let i = parsedData.plan.length; i < 7; i++) {
                parsedData.plan.push({
                    dayName: dayNames[i],
                    meals: [{ mealName: "Plano Indisponível", foods: ["Tente gerar novamente para este dia."], icon: "fas fa-exclamation-triangle" }]
                });
            }
        }

        res.json(parsedData);

    } catch (error) {
        console.error('Erro ao gerar conteúdo na Gemini API:', error);
        res.status(500).json({ error: 'Erro ao gerar plano alimentar: ' + error.message });
    }
});

app.listen(port, () => {
    console.log(`Servidor rodando em http://localhost:${port}`);
});
