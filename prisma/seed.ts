import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';

const prisma = new PrismaClient();

function generateSecurePassword(): string {
  const length = 16;
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*()_+';
  let password = '';
  for (let i = 0; i < length; i++) {
    password += chars[crypto.randomInt(0, chars.length)];
  }
  return password;
}

async function main() {
  console.log('Seeding database...\n');

  // ── Admin user ──
  const existingAdmin = await prisma.user.findUnique({ where: { username: 'admin' } });

  if (!existingAdmin) {
    const adminPassword = generateSecurePassword();
    const hashed = await bcrypt.hash(adminPassword, 12);

    const admin = await prisma.user.create({
      data: {
        username: 'admin',
        password: hashed,
        nickname: '系统管理员',
        isAdmin: true,
        bio: '平台管理员',
        updatedAt: new Date(),
        failedLoginAttempts: 0,
      },
    });

    console.log('Admin account created:');
    console.log(`  username: admin`);
    console.log(`  password: ${adminPassword}\n`);

    await prisma.adminauditlog.create({
      data: {
        userId: admin.id,
        action: 'ADMIN_ACCOUNT_CREATED',
        targetType: 'user',
        targetId: admin.id,
        details: JSON.stringify({ message: 'Seed script created admin' }),
        ipAddress: '127.0.0.1',
        userAgent: 'seed-script',
      },
    });
  } else {
    console.log('Admin account already exists.\n');
  }

  // ── Demo users ──
  const demoUsers = [
    { username: 'alice', nickname: 'Alice', bio: 'Full-stack developer & open source enthusiast' },
    { username: 'bob', nickname: 'Bob', bio: 'Designer, photographer, traveler' },
    { username: 'charlie', nickname: 'Charlie', bio: 'Blockchain researcher & Web3 advocate' },
    { username: 'diana', nickname: 'Diana', bio: 'Data scientist, AI/ML engineer' },
  ];

  const createdUsers: { id: number; username: string }[] = [];
  const hashedPw = await bcrypt.hash('123456', 12);

  for (const u of demoUsers) {
    const existing = await prisma.user.findUnique({ where: { username: u.username } });
    if (!existing) {
      const user = await prisma.user.create({
        data: {
          username: u.username,
          password: hashedPw,
          nickname: u.nickname,
          bio: u.bio,
          updatedAt: new Date(),
        },
        select: { id: true, username: true },
      });
      createdUsers.push(user);
      console.log(`Demo user: ${user.username} (password: 123456)`);
    } else {
      createdUsers.push({ id: existing.id, username: existing.username });
    }
  }

  if (createdUsers.length >= 3) {
    // ── Follow relationships ──
    const existingFollows = await prisma.userfollows.count();
    if (existingFollows === 0) {
      await prisma.userfollows.createMany({
        data: [
          { followerId: createdUsers[0]!.id, followingId: createdUsers[1]!.id },
          { followerId: createdUsers[1]!.id, followingId: createdUsers[0]!.id },
          { followerId: createdUsers[0]!.id, followingId: createdUsers[2]!.id },
          { followerId: createdUsers[2]!.id, followingId: createdUsers[3]!.id },
        ],
      });
      console.log('Follow relationships created.');
    }

    // ── Demo posts ──
    const existingArticles = await prisma.article.count();
    if (existingArticles === 0) {
      const articles = [
        {
          userId: createdUsers[0]!.id,
          title: 'Welcome to Decentralized Social',
          content: 'This is the first article on our decentralized social platform. Data ownership and privacy are core values here. Every piece of content is stored on IPFS with content-addressed storage.',
          visibility: 'public',
        },
        {
          userId: createdUsers[1]!.id,
          title: 'Design in the Age of Web3',
          content: 'Web3 brings new challenges and opportunities for designers. How do we design interfaces that respect user sovereignty while maintaining usability? This article explores key design principles for decentralized applications.',
          visibility: 'public',
        },
        {
          userId: createdUsers[2]!.id,
          title: 'Understanding DHT for Peer Discovery',
          content: 'Distributed Hash Tables (DHT) are the backbone of P2P networks. This post explains how Kademlia DHT works, its role in libp2p, and why it matters for decentralized social platforms.',
          visibility: 'public',
        },
        {
          userId: createdUsers[3]!.id,
          title: 'Machine Learning on the Edge',
          content: 'Edge ML is transforming how we think about data privacy. By running models locally, users can enjoy AI-powered features without sending personal data to centralized servers.',
          visibility: 'public',
        },
        {
          userId: createdUsers[0]!.id,
          title: 'Getting Started with Next.js 16',
          content: 'Next.js 16 introduces React Server Components by default, improved streaming, and better TypeScript support. This guide walks through building a full-stack app with the latest features.',
          visibility: 'public',
        },
      ];

      for (const a of articles) {
        await prisma.article.create({
          data: {
            ...a,
            createdAt: new Date(Date.now() - Math.random() * 7 * 86400000),
            updatedAt: new Date(),
          } as any,
        });
      }
      console.log(`${articles.length} demo articles created.`);
    }

    // ── Demo circle ──
    const existingCircles = await prisma.circle.count();
    if (existingCircles === 0 && createdUsers[0]) {
      const circle = await prisma.circle.create({
        data: {
          name: 'Web3 Developers',
          description: 'A community for Web3 and decentralized tech enthusiasts. Share knowledge, discuss projects, and collaborate.',
          creatorId: createdUsers[0]!.id,
          category: 'technology',
          updatedAt: new Date(),
        },
      });

      await prisma.circlemembers.createMany({
        data: [
          { circleId: circle.id, userId: createdUsers[0]!.id },
          { circleId: circle.id, userId: createdUsers[1]!.id },
          { circleId: circle.id, userId: createdUsers[2]!.id },
        ],
      });
      console.log('Demo circle "Web3 Developers" created with 3 members.');
    }

    // ── Demo topics ──
    const existingTopics = await prisma.topic.count();
    if (existingTopics === 0) {
      const topics = ['Web3', 'Blockchain', 'Next.js', 'TypeScript', 'AI', 'Privacy', 'IPFS', 'P2P'];
      for (const name of topics) {
        await prisma.topic.create({
          data: {
            name,
            postCount: Math.floor(Math.random() * 100),
            updatedAt: new Date(),
          },
        });
      }
      console.log(`${topics.length} demo topics created.`);
    }
  }

  console.log('\nSeed completed.');
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error('Seed failed:', e);
    await prisma.$disconnect();
    process.exit(1);
  });
