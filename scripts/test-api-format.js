const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function testApiDataFormat() {
  console.log('🧪 测试API返回的数据格式...\n');

  try {
    // 模拟 getArticleFeed 方法
    const articles = await prisma.article.findMany({
      where: { visibility: 'public' },
      take: 5,
      orderBy: { createdAt: 'desc' },
      include: {
        user: {
          select: {
            id: true,
            username: true,
            nickname: true,
            avatarCid: true,
          },
        },
        circle: {
          select: {
            id: true,
            name: true,
          },
        },
        articlelike: { select: { userId: true } },
        articlecomment: { select: { id: true } },
        articlerepost: { select: { id: true } },
      },
    });

    const formattedArticles = articles.map(article => ({
      ...article,
      author: article.user,
      likes: article.articlelike.length,
      comments: article.articlecomment.length,
      shares: article.articlerepost.length,
    }));

    console.log('📊 API返回的数据结构示例 (前5个文章):');
    console.log('='.repeat(100));

    for (let i = 0; i < formattedArticles.length; i++) {
      const post = formattedArticles[i];
      console.log(`\n[${i + 1}] 文章ID: ${post.id}`);
      console.log(`    标题: ${post.title?.substring(0, 40)}...`);
      console.log(`    创建时间: ${post.createdAt}`);
      console.log(`\n    🔢 关键字段值:`);
      console.log(`       - post.likes (后端计算): ${post.likes}`);
      console.log(`       - post.comments (后端计算): ${post.comments}`);
      console.log(`       - post.shares (后端计算): ${post.shares}`);
      console.log(`\n    🔍 前端可能的解析路径:`);
      console.log(`       - post._count?.articlelike: ${post._count?.articlelike || 'undefined'}`);
      console.log(`       - post._count?.articlerepost: ${post._count?.articlerepost || 'undefined'}`);
      console.log(`\n    ⚠️ 前端ContentFeed.tsx的映射逻辑:`);
      const frontendShares = post._count?.articlerepost || post.shares || post.reposts || 0;
      console.log(`       实际使用的值: ${frontendShares} (来源: ${post._count?.articlerepost ? '_count' : post.shares ? 'shares' : 'fallback'})`);

      // 检查是否有 _count 字段
      if (post._count) {
        console.log(`\n    ❌ 发现 _count 字段! 这可能导致前端使用错误的值`);
        console.log(`       _count内容:`, JSON.stringify(post._count));
      }
    }

    console.log('\n\n💡 分析结论:');
    console.log('   如果所有帖子的"实际使用的值"都正确，说明后端数据没问题');
    console.log('   如果某些帖子显示0或错误值，需要检查前端映射逻辑');

  } catch (error) {
    console.error('❌ 测试失败:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

testApiDataFormat();