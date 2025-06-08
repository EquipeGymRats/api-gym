const { GoogleGenerativeAI, HarmBlockThreshold, HarmCategory } = require('@google/generative-ai');
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const connectDB = require('../config/db'); // Corrigido para 'db'
const authRoutes = require('../routes/auth'); // Importa as rotas de autenticação
const authMiddleware = require('../middleware/auth'); // Importa o middleware de autenticação
const adminAuth = require('../middleware/admin'); // Importa o middleware de autenticação
const trainingRoutes = require('../routes/training');
const User = require('../models/User');
const Training = require('../models/Training');


const app = express();
const port = process.env.PORT || 3000;

// Conecta ao banco de dados
connectDB();

app.use(cors());
app.use(express.static('public')); // Crie uma pasta 'public' na raiz do seu projeto
app.use(express.json());

// Rotas de autenticação
app.use('/auth', authRoutes);
app.use('/training', trainingRoutes); // <-- ADICIONAR AQUI
// Exemplo de rota protegida por autenticação
app.get('/protected', authMiddleware, (req, res) => {
  // req.user agora conterá { id, username, email } do MongoDB
  res.json({ message: 'Você acessou uma rota protegida!', user: req.user });
});

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

app.post('/generate-nutrition-plan', authMiddleware, async (req, res) => {
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

// --- NOVAS ROTAS PARA O DASHBOARD ---

// Rotas de Dashboard (agora protegidas por authMiddleware e adminAuth)
app.get('/dashboard/users', authMiddleware, adminAuth, async (req, res) => {
    try {
        // Selecionar todos os campos, exceto a senha
        const users = await User.find().select('-password');
        res.json(users);
    } catch (error) {
        console.error('Erro ao buscar usuários:', error);
        res.status(500).json({ message: 'Erro ao buscar usuários.' });
    }
});

// Rota para deletar usuário (protegida por authMiddleware e adminAuth)
app.delete('/admin/users/:id', authMiddleware, adminAuth, async (req, res) => {
    try {
        const { id } = req.params;

        // Não permitir que um admin delete a si mesmo (opcional, mas boa prática)
        if (req.user.id === id) {
            return res.status(400).json({ message: 'Um administrador não pode deletar sua própria conta.' });
        }

        const userToDelete = await User.findById(id);
        if (!userToDelete) {
            return res.status(404).json({ message: 'Usuário não encontrado.' });
        }

        await Training.deleteMany({ user: id });
        await User.findByIdAndDelete(id);

        res.json({ message: 'Usuário e dados associados deletados com sucesso.' });
    } catch (error) {
        console.error('Erro ao deletar usuário:', error);
        res.status(500).json({ message: 'Erro ao deletar usuário.' });
    }
});

// Rota para editar usuário (protegida por authMiddleware e adminAuth)
app.put('/admin/users/:id', authMiddleware, adminAuth, async (req, res) => {
    try {
        const { id } = req.params;
        const { username, email } = req.body;

        if (!username || !email) {
            return res.status(400).json({ message: 'Username e email são obrigatórios.' });
        }

        const user = await User.findByIdAndUpdate(
            id,
            { username, email },
            { new: true, runValidators: true }
        ).select('-password');

        if (!user) {
            return res.status(404).json({ message: 'Usuário não encontrado.' });
        }
        res.json({ message: 'Usuário atualizado com sucesso.', user });
    } catch (error) {
        console.error('Erro ao editar usuário:', error);
        res.status(500).json({ message: 'Erro ao editar usuário.' });
    }
});

// NOVA ROTA: Atualizar Role do Usuário (admin/user)
app.put('/admin/users/:id/role', authMiddleware, adminAuth, async (req, res) => {
    try {
        const { id } = req.params;
        const { role } = req.body;

        if (!['user', 'admin'].includes(role)) {
            return res.status(400).json({ message: 'Role inválida. Deve ser "user" ou "admin".' });
        }

        // Não permitir que um admin mude a própria role (para evitar se despromover acidentalmente)
        if (req.user.id === id && role !== 'admin') {
            return res.status(400).json({ message: 'Um administrador não pode remover sua própria permissão de administrador.' });
        }

        const user = await User.findByIdAndUpdate(
            id,
            { role },
            { new: true, runValidators: true }
        ).select('-password');

        if (!user) {
            return res.status(404).json({ message: 'Usuário não encontrado.' });
        }
        res.json({ message: `Role do usuário atualizada para ${role} com sucesso.`, user });
    } catch (error) {
        console.error('Erro ao atualizar role do usuário:', error);
        res.status(500).json({ message: 'Erro ao atualizar role do usuário.' });
    }
});

// NOVA ROTA: Ativar/Desativar Usuário
app.put('/admin/users/:id/status', authMiddleware, adminAuth, async (req, res) => {
    try {
        const { id } = req.params;
        const { isActive } = req.body;

        if (typeof isActive !== 'boolean') {
            return res.status(400).json({ message: 'O status isActive deve ser um booleano (true/false).' });
        }

        // Não permitir que um admin desative a si mesmo
        if (req.user.id === id && !isActive) {
            return res.status(400).json({ message: 'Um administrador não pode desativar sua própria conta.' });
        }

        const user = await User.findByIdAndUpdate(
            id,
            { isActive },
            { new: true }
        ).select('-password');

        if (!user) {
            return res.status(404).json({ message: 'Usuário não encontrado.' });
        }
        const statusMessage = isActive ? 'ativado' : 'desativado';
        res.json({ message: `Usuário ${statusMessage} com sucesso.`, user });
    } catch (error) {
        console.error('Erro ao atualizar status do usuário:', error);
        res.status(500).json({ message: 'Erro ao atualizar status do usuário.' });
    }
});


// Renovar senha (placeholder - em um app real, enviaria um email com token) (protegida por authMiddleware e adminAuth)
app.post('/admin/users/:id/reset-password', authMiddleware, adminAuth, async (req, res) => {
    try {
        const { id } = req.params;
        const user = await User.findById(id);

        if (!user) {
            return res.status(404).json({ message: 'Usuário não encontrado.' });
        }

        console.log(`[ADMIN AÇÃO] Solicitação de renovação de senha para: ${user.email}`);
        res.json({ message: `Instruções de renovação de senha (fictícias) enviadas para ${user.email}.` });
    } catch (error) {
        console.error('Erro ao solicitar renovação de senha:', error);
        res.status(500).json({ message: 'Erro ao solicitar renovação de senha.' });
    }
});

// Rota para buscar todos os treinos e planos de nutrição (protegida por authMiddleware e adminAuth)
app.get('/dashboard/training-nutrition', authMiddleware, adminAuth, async (req, res) => {
    try {
        const trainings = await Training.find().populate('user', 'username email');
        res.json(trainings);
    } catch (error) {
        console.error('Erro ao buscar treinos e planos de nutrição:', error);
        res.status(500).json({ message: 'Erro ao buscar treinos e planos de nutrição.' });
    }
});


app.listen(port, () => {
    console.log(`Servidor rodando em http://localhost:${port}`);
});