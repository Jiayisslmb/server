import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  Request,
} from '@nestjs/common';
import { ContentService } from './content.service';
import { CreateMomentDto, CreateArticleDto, UpdateMomentDto } from './dto';
import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard';
import { ParseIntPipe } from '@nestjs/common';
import { AdminService } from '../admin/admin.service';

@Controller('content')
export class ContentController {
  constructor(
    private readonly contentService: ContentService,
    private readonly adminService: AdminService,
  ) {}

  // ==================== Moment 动态相关 ====================

  @Post('moments')
  @UseGuards(JwtAuthGuard)
  createMoment(@Request() req, @Body() createMomentDto: CreateMomentDto) {
    return this.contentService.createMoment(req.user.id, createMomentDto);
  }

  @Get('moments/feed')
  getMomentFeed(
    @Request() req,
    @Query('skip') skip?: string,
    @Query('take') take?: string,
  ) {
    const userId = req.user?.id || 0;
    return this.contentService.getMomentFeed(
      userId,
      parseInt(skip || '0'),
      parseInt(take || '20'),
    );
  }

  @Get('moments/user/:userId')
  getUserMoments(
    @Param('userId', ParseIntPipe) userId: number,
    @Request() req,
    @Query('skip') skip?: string,
    @Query('take') take?: string,
  ) {
    const viewerId = req.user?.id;
    return this.contentService.getUserMoments(
      userId,
      viewerId,
      parseInt(skip || '0'),
      parseInt(take || '20'),
    );
  }

  @Get('moments/:id')
  getMomentById(@Param('id', ParseIntPipe) id: number, @Request() req) {
    const userId = req.user?.id;
    return this.contentService.getMomentById(id, userId);
  }

  @Patch('moments/:id')
  @UseGuards(JwtAuthGuard)
  updateMoment(
    @Param('id', ParseIntPipe) id: number,
    @Request() req,
    @Body() updateMomentDto: UpdateMomentDto,
  ) {
    return this.contentService.updateMoment(id, req.user.id, updateMomentDto);
  }

  @Delete('moments/:id')
  @UseGuards(JwtAuthGuard)
  deleteMoment(@Param('id', ParseIntPipe) id: number, @Request() req) {
    return this.contentService.deleteMoment(id, req.user.id);
  }

  @Post('moments/:id/like')
  @UseGuards(JwtAuthGuard)
  likeMoment(@Param('id', ParseIntPipe) id: number, @Request() req) {
    return this.contentService.likeMoment(id, req.user.id);
  }

  @Delete('moments/:id/like')
  @UseGuards(JwtAuthGuard)
  unlikeMoment(@Param('id', ParseIntPipe) id: number, @Request() req) {
    return this.contentService.unlikeMoment(id, req.user.id);
  }

  @Post('moments/:id/comments')
  @UseGuards(JwtAuthGuard)
  commentMoment(
    @Param('id', ParseIntPipe) id: number,
    @Request() req,
    @Body('content') content: string,
    @Body('replyToId') replyToId?: number,
  ) {
    return this.contentService.commentOnMoment(id, req.user.id, content, replyToId);
  }

  @Get('moments/:id/comments')
  getMomentComments(
    @Param('id', ParseIntPipe) id: number,
    @Query('skip') skip?: string,
    @Query('take') take?: string,
  ) {
    return this.contentService.getMomentComments(
      id,
      parseInt(skip || '0'),
      parseInt(take || '20'),
    );
  }

  @Post('moments/:id/collect')
  @UseGuards(JwtAuthGuard)
  collectMoment(@Param('id', ParseIntPipe) id: number, @Request() req) {
    return this.contentService.collectMoment(id, req.user.id);
  }

  @Delete('moments/:id/collect')
  @UseGuards(JwtAuthGuard)
  uncollectMoment(@Param('id', ParseIntPipe) id: number, @Request() req) {
    return this.contentService.uncollectMoment(id, req.user.id);
  }

  @Get('moments/:id/is-liked')
  @UseGuards(JwtAuthGuard)
  isMomentLiked(@Param('id', ParseIntPipe) id: number, @Request() req) {
    return this.contentService.isMomentLiked(id, req.user.id);
  }

  @Get('moments/:id/is-collected')
  @UseGuards(JwtAuthGuard)
  isMomentCollected(@Param('id', ParseIntPipe) id: number, @Request() req) {
    return this.contentService.isMomentCollected(id, req.user.id);
  }

  @Post('moments/:id/repost')
  @UseGuards(JwtAuthGuard)
  repostMoment(@Param('id', ParseIntPipe) id: number, @Request() req, @Query('action') action?: string) {
    if (action === 'count_only') {
      return this.contentService.incrementMomentRepostCount(id, req.user.id);
    }
    return this.contentService.repostMoment(id, req.user.id);
  }

  @Get('moments/:id/repost-count')
  getMomentRepostCount(@Param('id', ParseIntPipe) id: number) {
    return this.contentService.getMomentRepostCount(id);
  }

  @Get('moments/user/:userId/collections')
  getUserMomentCollections(
    @Param('userId', ParseIntPipe) userId: number,
    @Query('skip') skip?: string,
    @Query('take') take?: string,
  ) {
    return this.contentService.getUserMomentCollections(
      userId,
      parseInt(skip || '0'),
      parseInt(take || '20'),
    );
  }

  @Get('moments/user/:userId/likes')
  getUserMomentLikes(
    @Param('userId', ParseIntPipe) userId: number,
    @Query('skip') skip?: string,
    @Query('take') take?: string,
  ) {
    return this.contentService.getUserMomentLikes(
      userId,
      parseInt(skip || '0'),
      parseInt(take || '20'),
    );
  }

  @Get('moments/user/:userId/received-likes')
  getUserReceivedMomentLikes(
    @Param('userId', ParseIntPipe) userId: number,
    @Query('skip') skip?: string,
    @Query('take') take?: string,
  ) {
    return this.contentService.getUserReceivedMomentLikes(
      userId,
      parseInt(skip || '0'),
      parseInt(take || '20'),
    );
  }

  // ==================== Article 文章相关 ====================

  @Post('articles')
  @UseGuards(JwtAuthGuard)
  createArticle(@Request() req, @Body() createArticleDto: CreateArticleDto) {
    return this.contentService.createArticle(req.user.id, createArticleDto);
  }

  @Get('articles/feed')
  getArticleFeed(
    @Request() req,
    @Query('skip') skip?: string,
    @Query('take') take?: string,
  ) {
    const userId = req.user?.id || 0;
    return this.contentService.getArticleFeed(
      userId,
      parseInt(skip || '0'),
      parseInt(take || '20'),
    );
  }

  @Get('articles')
  getArticles(@Query('skip') skip?: string, @Query('take') take?: string) {
    return this.contentService.getArticles(
      parseInt(skip || '0'),
      parseInt(take || '20'),
    );
  }

  @Get('articles/user/:userId')
  getUserArticles(
    @Param('userId', ParseIntPipe) userId: number,
    @Request() req,
    @Query('skip') skip?: string,
    @Query('take') take?: string,
  ) {
    const viewerId = req.user?.id;
    return this.contentService.getUserArticles(
      userId,
      viewerId,
      parseInt(skip || '0'),
      parseInt(take || '20'),
    );
  }

  @Get('articles/:id')
  getArticleById(@Param('id', ParseIntPipe) id: number, @Request() req) {
    const userId = req.user?.id;
    return this.contentService.getArticleById(id, userId);
  }

  @Patch('articles/:id')
  @UseGuards(JwtAuthGuard)
  updateArticle(
    @Param('id', ParseIntPipe) id: number,
    @Request() req,
    @Body() updateData: Partial<CreateArticleDto>,
  ) {
    return this.contentService.updateArticle(id, req.user.id, updateData);
  }

  @Delete('articles/:id')
  @UseGuards(JwtAuthGuard)
  deleteArticle(@Param('id', ParseIntPipe) id: number, @Request() req) {
    return this.contentService.deleteArticle(id, req.user.id);
  }

  @Post('articles/:id/like')
  @UseGuards(JwtAuthGuard)
  likeArticle(@Param('id', ParseIntPipe) id: number, @Request() req) {
    return this.contentService.likeArticle(id, req.user.id);
  }

  @Delete('articles/:id/like')
  @UseGuards(JwtAuthGuard)
  unlikeArticle(@Param('id', ParseIntPipe) id: number, @Request() req) {
    return this.contentService.unlikeArticle(id, req.user.id);
  }

  @Post('articles/:id/comments')
  @UseGuards(JwtAuthGuard)
  commentArticle(
    @Param('id', ParseIntPipe) id: number,
    @Request() req,
    @Body('content') content: string,
    @Body('replyToId') replyToId?: number,
  ) {
    return this.contentService.commentOnArticle(id, req.user.id, content, replyToId);
  }

  @Get('articles/:id/comments')
  getArticleComments(
    @Param('id', ParseIntPipe) id: number,
    @Query('skip') skip?: string,
    @Query('take') take?: string,
  ) {
    return this.contentService.getArticleComments(
      id,
      parseInt(skip || '0'),
      parseInt(take || '20'),
    );
  }

  @Post('articles/:id/collect')
  @UseGuards(JwtAuthGuard)
  collectArticle(@Param('id', ParseIntPipe) id: number, @Request() req) {
    return this.contentService.collectArticle(id, req.user.id);
  }

  @Delete('articles/:id/collect')
  @UseGuards(JwtAuthGuard)
  uncollectArticle(@Param('id', ParseIntPipe) id: number, @Request() req) {
    return this.contentService.uncollectArticle(id, req.user.id);
  }

  @Get('articles/:id/is-liked')
  @UseGuards(JwtAuthGuard)
  isArticleLiked(@Param('id', ParseIntPipe) id: number, @Request() req) {
    return this.contentService.isArticleLiked(id, req.user.id);
  }

  @Get('articles/:id/is-collected')
  @UseGuards(JwtAuthGuard)
  isArticleCollected(@Param('id', ParseIntPipe) id: number, @Request() req) {
    return this.contentService.isArticleCollected(id, req.user.id);
  }

  @Post('articles/:id/repost')
  @UseGuards(JwtAuthGuard)
  repostArticle(@Param('id', ParseIntPipe) id: number, @Request() req, @Query('action') action?: string) {
    if (action === 'count_only') {
      return this.contentService.incrementArticleRepostCount(id, req.user.id);
    }
    return this.contentService.repostArticle(id, req.user.id);
  }

  @Get('articles/:id/repost-count')
  getArticleRepostCount(@Param('id', ParseIntPipe) id: number) {
    return this.contentService.getArticleRepostCount(id);
  }

  @Get('articles/user/:userId/collections')
  getUserArticleCollections(
    @Param('userId', ParseIntPipe) userId: number,
    @Query('skip') skip?: string,
    @Query('take') take?: string,
  ) {
    return this.contentService.getUserArticleCollections(
      userId,
      parseInt(skip || '0'),
      parseInt(take || '20'),
    );
  }

  @Get('articles/user/:userId/likes')
  getUserArticleLikes(
    @Param('userId', ParseIntPipe) userId: number,
    @Query('skip') skip?: string,
    @Query('take') take?: string,
  ) {
    return this.contentService.getUserArticleLikes(
      userId,
      parseInt(skip || '0'),
      parseInt(take || '20'),
    );
  }

  @Get('articles/user/:userId/received-likes')
  getUserReceivedArticleLikes(
    @Param('userId', ParseIntPipe) userId: number,
    @Query('skip') skip?: string,
    @Query('take') take?: string,
  ) {
    return this.contentService.getUserReceivedArticleLikes(
      userId,
      parseInt(skip || '0'),
      parseInt(take || '20'),
    );
  }

  // ==================== 搜索相关 ====================

  @Get('search')
  searchContent(
    @Query('q') query: string,
    @Query('type') type?: string,
    @Query('skip') skip?: string,
    @Query('take') take?: string,
  ) {
    return this.contentService.searchContent(
      query,
      type,
      parseInt(skip || '0'),
      parseInt(take || '20'),
    );
  }

  // ==================== 举报功能 ====================

  @Post('moments/:id/report')
  @UseGuards(JwtAuthGuard)
  reportMoment(
    @Param('id', ParseIntPipe) id: number,
    @Request() req,
    @Body('reason') reason: string,
    @Body('description') description?: string,
  ) {
    return this.adminService.createReport(
      'moment',
      id,
      reason,
      description,
      req.user.id,
    );
  }

  @Post('articles/:id/report')
  @UseGuards(JwtAuthGuard)
  reportArticle(
    @Param('id', ParseIntPipe) id: number,
    @Request() req,
    @Body('reason') reason: string,
    @Body('description') description?: string,
  ) {
    return this.adminService.createReport(
      'article',
      id,
      reason,
      description,
      req.user.id,
    );
  }

  @Post('circles/:id/report')
  @UseGuards(JwtAuthGuard)
  reportCircle(
    @Param('id', ParseIntPipe) id: number,
    @Request() req,
    @Body('reason') reason: string,
    @Body('description') description?: string,
  ) {
    return this.adminService.createReport(
      'circle',
      id,
      reason,
      description,
      req.user.id,
    );
  }
}
