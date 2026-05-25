const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function diagnosePostRepostData() {
  console.log('🔍 开始诊断帖子转发数据...\n');

  try {
    // 获取所有文章及其转发数
    const articles = await prisma.article.findMany({
      select: {
        id: true,
        title: true,
        createdAt: true,
        _count: {
          select: {
            articlerepost: true,
          },
        },
      },
      orderBy: { createdAt: 'asc' },
      take: 10,  // 只看前10个最早的
    });

    console.log('📄 文章转发数据 (按时间排序，显示最早10个):');
    console.log('='.repeat(80));

    for (const article of articles) {
      const repostRecords = await prisma.articlerepost.findMany({
        where: { articleId: article.id },
        select: {
          id: true,
          userId: true,
          createdAt: true,
        },
      });

      // 检查是否有重复的userId
      const userIds = repostRecords.map(r => r.userId);
      const uniqueUserIds = [...new Set(userIds)];
      const hasDuplicates = userIds.length !== uniqueUserIds.length;

      console.log(`\n📝 文章ID: ${article.id}`);
      console.log(`   标题: ${article.title?.substring(0, 50)}...`);
      console.log(`   创建时间: ${article.createdAt}`);
      console.log(`   数据库实际转发记录数: ${repostRecords.length}`);
      console.log(`   Prisma _count统计: ${article._count.articlerepost}`);
      console.log(`   不同用户转发数: ${uniqueUserIds.length}`);
      console.log(`   是否有重复记录: ${hasDuplicates ? '⚠️ 是' : '✅ 否'}`);

      if (hasDuplicates) {
        console.log('\n   ⚠️ 发现重复转发记录:');
        const duplicates = userIds.filter((id, index) => userIds.indexOf(id) !== index);
        const uniqueDuplicates = [...new Set(duplicates)];
        for (const dupUserId of uniqueDuplicates) {
          const userRecords = repostRecords.filter(r => r.userId === dupUserId);
          console.log(`   - 用户${dupUserId} 有 ${userRecords.length} 条转发记录`);
          userRecords.forEach((record, idx) => {
            console.log(`     记录${idx + 1}: ID=${record.id}, 时间=${record.createdAt}`);
          });
        }
      }

      if (repostRecords.length > 0) {
        console.log('\n   📋 所有转发记录详情:');
        repostRecords.forEach((record, idx) => {
          console.log(`     [${idx + 1}] ID:${record.id} | 用户:${record.userId} | 时间:${record.createdAt}`);
        });
      }
    }

    // 获取所有动态及其转发数
    const moments = await prisma.moment.findMany({
      select: {
        id: true,
        content: true,
        createdAt: true,
        _count: {
          select: {
            momentrepost: true,
          },
        },
      },
      orderBy: { createdAt: 'asc' },
      take: 10,  // 只看前10个最早的
    });

    console.log('\n\n💬 动态转发数据 (按时间排序，显示最早10个):');
    console.log('='.repeat(80));

    for (const moment of moments) {
      const repostRecords = await prisma.momentrepost.findMany({
        where: { momentId: moment.id },
        select: {
          id: true,
          userId: true,
          createdAt: true,
        },
      });

      // 检查是否有重复的userId
      const userIds = repostRecords.map(r => r.userId);
      const uniqueUserIds = [...new Set(userIds)];
      const hasDuplicates = userIds.length !== uniqueUserIds.length;

      console.log(`\n💬 动态ID: ${moment.id}`);
      console.log(`   内容: ${moment.content?.substring(0, 50)}...`);
      console.log(`   创建时间: ${moment.createdAt}`);
      console.log(`   数据库实际转发记录数: ${repostRecords.length}`);
      console.log(`   Prisma _count统计: ${moment._count.momentrepost}`);
      console.log(`   不同用户转发数: ${uniqueUserIds.length}`);
      console.log(`   是否有重复记录: ${hasDuplicates ? '⚠️ 是' : '✅ 否'}`);

      if (hasDuplicates) {
        console.log('\n   ⚠️ 发现重复转发记录:');
        const duplicates = userIds.filter((id, index) => userIds.indexOf(id) !== index);
        const uniqueDuplicates = [...new Set(duplicates)];
        for (const dupUserId of uniqueDuplicates) {
          const userRecords = repostRecords.filter(r => r.userId === dupUserId);
          console.log(`   - 用户${dupUserId} 有 ${userRecords.length} 条转发记录`);
          userRecords.forEach((record, idx) => {
            console.log(`     记录${idx + 1}: ID=${record.id}, 时间=${record.createdAt}`);
          });
        }
      }

      if (repostRecords.length > 0) {
        console.log('\n   📋 所有转发记录详情:');
        repostRecords.forEach((record, idx) => {
          console.log(`     [${idx + 1}] ID:${record.id} | 用户:${record.userId} | 时间:${record.createdAt}`);
        });
      }
    }

    console.log('\n\n✅ 诊断完成！');
    console.log('\n💡 如果发现重复记录或数据不一致，请运行清理脚本修复。');

  } catch (error) {
    console.error('❌ 诊断失败:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

diagnosePostRepostData();