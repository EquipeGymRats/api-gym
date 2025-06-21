// api/services/notificationScheduler.js
const cron = require('node-cron');
const webpush = require('web-push');
const Reminder = require('../models/Reminder');
const User = require('../models/User');

function initializeScheduler() {
    console.log('Agendador de notificações inicializado.');

    // Configura o web-push com suas chaves VAPID
    webpush.setVapidDetails(
        process.env.VAPID_SUBJECT,
        process.env.VAPID_PUBLIC_KEY,
        process.env.VAPID_PRIVATE_KEY
    );

    // Roda a tarefa a cada minuto
    cron.schedule('* * * * *', async () => {
        const now = new Date();
        const currentTime = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
        const dayNames = ["Domingo", "Segunda-feira", "Terça-feira", "Quarta-feira", "Quinta-feira", "Sexta-feira", "Sábado"];
        const currentDay = dayNames[now.getDay()];

        try {
            // Encontra todos os lembretes ativos que correspondem ao horário e dia atuais
            const dueReminders = await Reminder.find({
                isActive: true,
                time: currentTime,
                days: currentDay
            }).populate('user', 'pushSubscription'); // Puxa a inscrição do usuário

            if (dueReminders.length > 0) {
                console.log(`Encontrados ${dueReminders.length} lembretes para enviar.`);
            }

            // Dispara uma notificação para cada lembrete encontrado
            for (const reminder of dueReminders) {
                if (reminder.user && reminder.user.pushSubscription) {
                    const payload = JSON.stringify({
                        title: 'Lembrete Gym Rats!',
                        body: reminder.message,
                    });
                    
                    webpush.sendNotification(reminder.user.pushSubscription, payload)
                        .catch(error => console.error(`Erro ao enviar push para ${reminder.user._id}:`, error.body));
                }
            }
        } catch (error) {
            console.error('Erro no agendador de notificações:', error);
        }
    });
}

module.exports = { initializeScheduler };