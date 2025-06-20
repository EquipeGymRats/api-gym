const { GoogleGenerativeAI, HarmBlockThreshold, HarmCategory } = require('@google/generative-ai');
require('dotenv').config();
const express = require('express');
const cors = require('cors');

const connectDB = require('../config/db'); // Corrigido para 'db'
const authMiddleware = require('../middleware/auth'); // Importa o middleware de autenticação
const adminAuth = require('../middleware/admin'); // Importa o middleware de autenticação
const User = require('../models/User');
const Training = require('../models/Training');
const postRoutes = require('../routes/Posts'); // <<< ADICIONE ESTA LINHA
const rateLimit = require('express-rate-limit'); // <<< 1. IMPORTAR
const trainingRoutes = require('../routes/training');
const authRoutes = require('../routes/auth'); // Importa as rotas de autenticação
const nutritionRoutes = require('../routes/nutrition'); // <<< ADICIONE ESTA LINHA
const crypto = require('crypto'); // <<< ADICIONAR ESTA LINHA



const app = express();
const port = process.env.PORT || 3000;

app.set('trust proxy', 1);

// Limitador geral para todas as requisições
const globalLimiter = rateLimit({
	windowMs: 15 * 60 * 1000, // 15 minutos
	max: 100, // Limita cada IP a 100 requisições por janela (15 min)
	standardHeaders: true, // Retorna informações do limite nos headers `RateLimit-*`
	legacyHeaders: false, // Desabilita os headers `X-RateLimit-*` (legado)
    message: { message: "Muitas requisições enviadas deste IP, por favor, tente novamente após 15 minutos." },
});

// Limitador mais estrito para rotas sensíveis (autenticação e IA)
const sensitiveRoutesLimiter = rateLimit({
	windowMs: 15 * 60 * 1000, // 15 minutos
	max: 25, // Limita cada IP a 25 requisições por janela (15 min)
    standardHeaders: true,
	legacyHeaders: false,
	message: { message: "Muitas tentativas de acesso a este recurso, por favor, tente novamente mais tarde." },
});

// Aplicar o limitador global a TODAS as rotas
app.use(globalLimiter);

// Conecta ao banco de dados
connectDB();
app.use(cors());

app.use(express.static('public')); // Crie uma pasta 'public' na raiz do seu projeto
app.use(express.json());

// Rotas de autenticação
app.use('/auth', sensitiveRoutesLimiter, authRoutes);
app.use('/training', trainingRoutes);
app.use('/posts', postRoutes);
app.use('/nutrition', nutritionRoutes); // <<< ADICIONE ESTA LINHA

app.get('/connect', (req, res) => {
  res.send('API Gym Rats está no ar!');
});

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

app.post('/generate-nutrition-plan', authMiddleware, async (req, res) => {
     const { weight, height, age, gender, activityLevel, goal, mealsPerDay, dietType, restrictions } = req.body;

    // <<< CORREÇÃO >>>
    // Agrupamos os dados recebidos em um único objeto para uso posterior.
    const userInputs = { weight, height, age, gender, activityLevel, goal, mealsPerDay, dietType, restrictions };

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
    model: "gemini-1.5-flash",
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
                            dayName: { type: "string" },
                            meals: {
                                type: "array",
                                items: {
                                    type: "object",
                                    properties: {
                                        mealName: { type: "string" },
                                        foods: {
                                            type: "array",
                                            items: { type: "string" }
                                        },
                                        icon: { type: "string", description: "Classe Font Awesome 6 Free (ex: fas fa-coffee)" },
                                        // --- NOVOS CAMPOS ---
                                        macronutrients: {
                                            type: "object",
                                            description: "Estimativa de macronutrientes para a refeição.",
                                            properties: {
                                                protein: { type: "string", description: "Proteínas em gramas (ex: '30g')" },
                                                carbohydrates: { type: "string", description: "Carboidratos em gramas (ex: '50g')" },
                                                fats: { type: "string", description: "Gorduras em gramas (ex: '15g')" }
                                            }
                                        },
                                        preparationTip: {
                                            type: "string",
                                            description: "Uma dica curta de preparo ou receita simples para a refeição.",
                                            nullable: true
                                        }
                                        // --- FIM DOS NOVOS CAMPOS ---
                                    },
                                    required: ["mealName", "foods", "icon", "macronutrients"]
                                }
                            }
                        },
                        required: ["dayName", "meals"]
                    }
                },
                tips: {
                    type: "array",
                    items: { type: "string" },
                    nullable: true
                }
            },
            required: ["plan"]
        }
    }
});

    // CORREÇÃO: Prompt ajustado para gerar plano de nutrição com as variáveis corretas.
    const prompt = `
        Você é um Nutricionista Esportivo especialista. Crie um plano alimentar semanal em JSON.

        O plano deve ser estruturado em 7 dias (Segunda-feira a Domingo).
        Para cada dia, crie ${mealsPerDay} refeições.
        Para cada refeição, forneça OBRIGATORIAMENTE os seguintes campos:
        - "mealName": Nome da refeição (ex: "Café da Manhã", "Almoço").
        - "foods": Um array de strings com sugestões de alimentos e quantidades aproximadas (ex: "100g de frango grelhado", "150g de batata doce").
        - "icon": Uma classe de ícone do Font Awesome 6 Free (ex: "fas fa-coffee").
        - "macronutrients": Um objeto com a estimativa de "protein", "carbohydrates", e "fats" em gramas (ex: { "protein": "30g", "carbohydrates": "50g", "fats": "15g" }).
        - "preparationTip": (Opcional) Uma dica curta de preparo para a refeição.

        O plano deve ser balanceado para atingir o objetivo do usuário.
        Adicionalmente, forneça uma propriedade "tips" no JSON principal, contendo um array com 3 a 5 dicas gerais de nutrição e hidratação.

        Detalhes do usuário e da dieta:
        - Objetivo Calórico Diário: Aproximadamente ${targetCalories} kcal.
        - Meta Principal: ${goal}.
        - Preferência de Dieta: ${dietType}.
        - Restrições Alimentares: ${restrictions || 'Nenhuma'}.

        A resposta DEVE ser um único bloco de código JSON válido, completo e sem interrupções, seguindo o schema definido.
    `;

    console.log("Prompt enviado para Gemini API:", prompt);

    try {
        const result = await model.generateContent(prompt);
        const response = await result.response;
        const jsonResponse = response.text();

        let parsedData;
        try {
            parsedData = JSON.parse(jsonResponse);
        } catch (jsonError) {
            console.error("Erro de parse do JSON da Gemini API:", jsonError);
            const cleanedJson = jsonResponse.replace(/```json|```/g, '').trim();
            try {
                parsedData = JSON.parse(cleanedJson);
            } catch (secondJsonError) {
                console.error("Segunda tentativa de parse do JSON falhou:", secondJsonError);
                return res.status(500).json({ error: 'A resposta da IA não é um JSON válido, mesmo após limpeza.' });
            }
        }

            if (parsedData.plan && Array.isArray(parsedData.plan)) {
            parsedData.plan.forEach(day => {
                if (day.meals && Array.isArray(day.meals)) {
                    day.meals.forEach(meal => {
                        // Garante que o objeto macronutrients exista
                        if (!meal.macronutrients) {
                            meal.macronutrients = {};
                        }
                        // Define valores padrão para os campos obrigatórios se estiverem faltando
                        meal.macronutrients.protein = meal.macronutrients.protein || '0g';
                        meal.macronutrients.carbohydrates = meal.macronutrients.carbohydrates || '0g';
                        meal.macronutrients.fats = meal.macronutrients.fats || '0g';
                    });
                }
            });
        }

        if (!parsedData || !Array.isArray(parsedData.plan)) {
            throw new Error("A resposta da IA não contém um array 'plan' válido.");
        }

        const planString = JSON.stringify(parsedData.plan);
        const signature = crypto
            .createHmac('sha256', process.env.INTEGRITY_SECRET)
            .update(planString)
            .digest('hex');

        const finalResponse = {
            userInputs,
            ...parsedData,
            signature
        };

        res.json(finalResponse);

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
    console.log(`+ Servidor rodando em http://localhost:${port}`);
});

app.get("/users/:id", authMiddleware, async (req, res) => {
    try {
        const user = await User.findById(req.params.id).select("-password");
        if (!user) {
            return res.status(404).json({ message: "Usuário não encontrado." });
        }
        res.json(user);
    } catch (error) {
        console.error("Erro ao buscar usuário por ID:", error);
        res.status(500).json({ message: "Erro interno do servidor." });
    }
});

module.exports = app;

// NOVA ROTA: Obter perfil de usuário por ID (para exibição no modal)
app.get("/users/:id/profile", authMiddleware, async (req, res) => {
    try {
        const user = await User.findById(req.params.id).select("-password");
        if (!user) {
            return res.status(404).json({ message: "Usuário não encontrado." });
        }
        res.json(user);
    } catch (error) {
        console.error("Erro ao buscar usuário por ID:", error);
        res.status(500).json({ message: "Erro interno do servidor." });
    }
});