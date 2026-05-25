const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function testRepostAPI() {
  console.log('🧪 测试转发API功能...\n');

  try {
    // 获取第一个文章
    const article = await prisma.article.findFirst({
      where: { visibility: 'public' },
      select: { id: true, title: true },
    });

    if (!article) {
      console.log('❌ 没有找到文章');
      return;
    }

    console.log(`📝 测试文章ID: ${article.id} - ${article.title}`);

    // 获取当前转发数
    const beforeCount = await prisma.articlerepost.count({
      where: { articleId: article.id },
    });
    console.log(`\n📊 转发前计数: ${beforeCount}`);

    // 模拟用户1的转发请求（使用count_only模式）
    const testUserId = 1;

    // 检查是否已存在
    const existingRepost = await prisma.articlerepost.findFirst({
      where: {
        articleId: article.id,
        userId: testUserId,
      },
    });

    if (!existingRepost) {
      console.log(`\n✅ 用户${testUserId}尚未转发，创建新记录...`);
      await prisma.articlerepost.create({
        data: { articleId: article.id, userId: testUserId },
      });
    } else {
      console.log(`\n⚠️ 用户${testUserId}已经转发过，跳过创建`);
    }

    // 再次获取转发数
    const afterCount = await prisma.articlerepost.count({
      where: { articleId: article.id },
    });
    console.log(`\n📊 转发后计数: ${afterCount}`);
    console.log(`📈 计数变化: +${afterCount - beforeCount}`);

    // 验证返回格式
    console.log('\n\n🔍 验证API返回数据格式:');
    console.log('='.repeat(60));

    // 模拟getArticleFeed的返回
    const feedArticle = await prisma.article.findUnique({
      where: { id: article.id },
      include: {
        user: { select: { id: true, username: true, nickname: true, avatarCid: true } },
        articlerepost: { select: { id: true } },
      },
    });

    if (feedArticle) {
      const apiResponse = {
        ...feedArticle,
        author: feedArticle.user,
        likes: 0, // 简化测试
        comments: 0, // 简化测试
        shares: feedArticle.articlerepost.length,
      };

      console.log('\n📦 API应该返回的数据:');
      console.log(`   - ID: ${apiResponse.id}`);
      console.log(`   - shares字段值: ${apiResponse.shares}`);
      console.log(`   - articlerepost数组长度: ${feedArticle.articlerepost.length}`);
      console.log(`   - 前端映射结果: post.shares = ${apiResponse.shares}`);

      if (apiResponse.shares === afterCount) {
        console.log('\n✅ 数据一致性验证通过！');
      } else {
        console.log('\n❌ 数据不一致！API返回值与实际计数不匹配');
      }
    }

    // 清理测试数据（可选）
    console.log('\n\n🧹 清理测试数据...');
    if (!existingRepost) {
      await prisma.articlerepost.deleteMany({
        where: {
          articleId: article.id,
          userId: testUserId,
        },
      });
      console.log('✅ 已删除测试记录');
    }

    console.log('\n\n✅ API测试完成！');

  } catch (error) {
    console.error('❌ 测试失败:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

testRepostAPI();