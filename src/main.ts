/**
 * NestJS 后端应用入口文件
 *
 * 文件功能说明：
 * - 初始化和配置NestJS应用实例
 * - 配置全局中间件（CORS、验证管道、WebSocket适配器）
 * - 集成Swagger API文档生成
 * - 启动HTTP服务器监听请求
 *
 * 技术架构：
 * - 框架：NestJS 11（企业级Node.js框架）
 * - 文档：Swagger/OpenAPI 3.0规范
 * - 实时通信：Socket.IO（WebSocket实现）
 * - 数据验证：class-validator + class-transformer
 *
 * 核心模块说明：
 * - AppModule: 根模块，包含所有功能模块
 * - ConfigService: 环境变量管理服务
 * - ValidationPipe: 全局数据验证管道
 * - IoAdapter: WebSocket适配器，支持Socket.IO
 *
 * @module main.ts
 * @version 1.0.0
 * @requires @nestjs/core NestJS核心模块
 * @requires @nestjs/swagger Swagger文档生成
 * @requires @nestjs/common 公共工具类
 * @requires @nestjs/platform-socket.io Socket.IO平台适配器
 */

import { NestFactory } from '@nestjs/core';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { ConfigService } from '@nestjs/config';

/**
 * 应用启动引导函数
 *
 * @async
 * @function bootstrap
 * @returns {Promise<void>} 异步启动过程
 *
 * @description 执行以下初始化步骤：
 * 1. 创建NestJS应用实例
 * 2. 获取配置服务实例
 * 3. 配置CORS跨域策略
 * 4. 设置WebSocket适配器
 * 5. 配置全局API前缀
 * 6. 注册全局验证管道
 * 7. 生成并挂载Swagger文档
 * 8. 启动HTTP服务器
 *
 * @throws {Error} 如果端口被占用或配置错误会抛出异常
 *
 * @example
 * // 启动命令
 * // npm run start:dev (开发模式)
 * // npm run start (生产模式)
 */
async function bootstrap() {
  /**
   * 步骤1: 创建NestJS应用实例
   *
   * @type {INestApplication}
   * @description 使用AppModule作为根模块创建应用
   * AppModule会递归加载所有子模块和服务
   */
  const app = await NestFactory.create(AppModule);

  /**
   * 步骤2: 获取配置服务实例
   *
   * @type {ConfigService}
   * @description 用于读取环境变量和配置文件
   * 支持从.env文件、系统环境变量等来源加载配置
   */
  const configService = app.get(ConfigService);

  // ============================================================
  // 步骤3: 配置CORS（跨域资源共享）策略
  // ============================================================

  /**
   * CORS允许的源地址列表
   *
   * @type {string[]}
   * @description 从环境变量CORS_ORIGINS读取，支持多个源用逗号分隔
   * 默认值：['http://localhost:3000', 'http://127.0.0.1:3000']
   *
   * @security 安全性考虑：
   * - 生产环境应严格限制允许的域名
   * - 避免使用通配符'*'以防止CSRF攻击
   * - 开发环境可放宽限制便于调试
   */
  const corsOrigins = configService.get<string>('CORS_ORIGINS')?.split(',') || ['http://localhost:3000', 'http://127.0.0.1:3000'];

  /**
   * 启用CORS中间件
   *
   * @description 配置选项说明：
   * - origin: 允许的源地址数组
   * - credentials: 是否允许携带Cookie和认证头
   * - methods: 允许的HTTP方法列表
   * - allowedHeaders: 允许的请求头列表
   *
   * @note credentials: true 必须配合具体origin使用，不能是'*'
   */
  app.enableCors({
    origin: corsOrigins,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  });

  // ============================================================
  // 步骤4: 配置WebSocket适配器
  // ============================================================

  /**
   * 设置WebSocket适配器
   *
   * @description 使用IoAdapter将Socket.IO集成到NestJS
   * 支持的功能：
   * - 实时消息推送
   * - 用户在线状态同步
   * - 打字指示器
   * - 心跳检测机制
   *
   * @technical 技术细节：
   * - 默认轮询间隔：25秒
   * - 心跳超时：60秒
   * - 最大重连次数：5次
   * - 支持自动降级到长轮询
   */
  app.useWebSocketAdapter(new IoAdapter(app));

  // ============================================================
  // 步骤5: 配置全局API前缀
  // ============================================================

  /**
   * 设置全局路由前缀
   *
   * @type {string}
   * @value 'api'
   * @description 所有API路径都会自动添加/api前缀
   *
   * 示例：
   * - 控制器定义：@Get('users')
   * - 实际访问路径：/api/users
   *
   * @benefit 好处：
   * - 统一API命名空间
   * - 便于反向代理配置
   * - 区分API请求和静态资源
   */
  app.setGlobalPrefix('api');

  // ============================================================
  // 步骤6: 配置全局验证管道
  // ============================================================

  /**
   * 全局数据验证管道
   *
   * @type {ValidationPipe}
   * @description 自动验证所有传入的请求数据
   *
   * 配置项说明：
   * - whitelist: true → 自动剥离未在DTO中定义的属性（防止属性注入攻击）
   * - forbidNonWhitelisted: true → 如果存在未定义属性则返回400错误
   * - transform: true → 自动将payload转换为DTO类的实例（支持类型转换）
   *
   * @security 安全特性：
   * - 防止NoSQL注入
   * - 防止属性污染攻击
   * - 强制类型安全
   *
   * @example DTO示例：
   * class CreateUserDto {
   *   @IsString()
   *   username: string;
   *
   *   @IsEmail()
   *   email: string;
   * }
   */
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    })
  );

  // ============================================================
  // 步骤7: 生成并配置Swagger API文档
  // ============================================================

  /**
   * Swagger文档构建器配置
   *
   * @type {DocumentBuilder}
   * @description 定义API文档的基本元信息
   *
   * 配置内容：
   * - title: API文档标题
   * - description: API描述信息
   * - version: API版本号（遵循语义化版本）
   * - addBearerAuth: 添加JWT Bearer Token认证支持
   *
   * @access 访问地址：http://localhost:3001/api-docs
   */
  const config = new DocumentBuilder()
    .setTitle('去中心化社交平台 API')
    .setDescription('后端 API 接口文档')
    .setVersion('1.0')
    .addBearerAuth()
    .build();

  /**
   * 生成Swagger文档对象
   *
   * @type {OpenApiObject}
   * @description 基于控制器装饰器和DTO类自动生成OpenAPI 3.0规范文档
   * 包含所有端点、参数、响应格式等信息
   */
  const document = SwaggerModule.createDocument(app, config);

  /**
   * 挂载Swagger UI界面
   *
   * @param {string} path - 访问路径 '/api-docs'
   * @param {INestApplication} app - NestJS应用实例
   * @param {OpenApiObject} document - OpenAPI文档对象
   *
   * @feature 功能特性：
   * - 交互式API测试界面
   * - 参数自动填充
   * - 认证Token输入框
   * - 响应示例展示
   */
  SwaggerModule.setup('api-docs', app, document);

  // ============================================================
  // 步骤8: 启动HTTP服务器
  // ============================================================

  /**
   * 服务监听端口
   *
   * @type {number | string}
   * @default 3001
   * @description 从环境变量NEST_PORT读取，默认3001
   *
   * @env 环境变量：NEST_PORT
   * @recommendation 建议：生产环境应通过环境变量配置
   */
  const port = process.env.NEST_PORT || 3001;

  /**
   * 启动HTTP服务器监听
   *
   * @description 开始接受传入的HTTP和WebSocket连接
   * 成功启动后会打印服务信息到控制台
   */
  await app.listen(port);

  /**
   * 打印启动成功信息
   *
   * @console 输出内容包括：
   * - HTTP服务地址
   * - Swagger文档地址
   * - WebSocket服务地址
   */
  console.log(`\n🚀 后端服务启动成功：http://localhost:${port}`);
  console.log(`📚 Swagger API 文档：http://localhost:${port}/api-docs`);
  console.log(`🔌 WebSocket 服务：ws://localhost:${port}/chat\n`);
}

/**
 * 执行应用启动
 *
 * @description 调用bootstrap函数启动NestJS应用
 * 使用顶层await确保异步操作完成
 */
bootstrap();