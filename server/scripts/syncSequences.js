import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function syncAllSequences() {
    const tables = [
        'companies', 'roles', 'departments', 'users',
        'courses', 'course_modules', 'lessons', 'quizzes',
        'quiz_questions', 'quiz_answers', 'course_assignments',
        'progress', 'certificates', 'chat_threads',
        'chat_thread_participants', 'chat_messages', 'background_jobs',
        'audit_logs', 'user_invitations'
    ];

    for (const table of tables) {
        try {
            // Проверяем, есть ли записи в таблице
            const result = await prisma.$queryRawUnsafe(`SELECT COUNT(*) FROM "${table}"`);
            const count = parseInt(result[0].count);

            if (count === 0) {
                console.log(`⚠️ Таблица "${table}" пуста, синхронизация не требуется`);
                continue;
            }

            // Устанавливаем последовательность на максимальный id
            const sequence = `"${table}_id_seq"`;
            await prisma.$executeRawUnsafe(`
        SELECT setval($1, (SELECT MAX(id) FROM "${table}"))
      `, sequence);
            console.log(`✅ Sequence ${sequence} synced (max id = ${await getMaxId(table)})`);
        } catch (error) {
            console.error(`❌ Ошибка синхронизации для "${table}":`, error.message);
        }
    }
}

async function getMaxId(table) {
    const result = await prisma.$queryRawUnsafe(`SELECT MAX(id) FROM "${table}"`);
    return result[0].max;
}

syncAllSequences()
    .catch(console.error)
    .finally(() => prisma.$disconnect());