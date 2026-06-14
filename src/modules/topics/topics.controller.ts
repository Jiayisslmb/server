import { Controller, Get, Post, Body, Query, Param, UseGuards } from '@nestjs/common';
import { TopicsService } from './topics.service';
import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard';

@Controller('topics')
export class TopicsController {
  constructor(private readonly topicsService: TopicsService) {}

  @Get('trending')
  getTrendingTopics(@Query('limit') limit?: string) {
    return this.topicsService.getTrendingTopics(parseInt(limit || '10'));
  }

  @Get('hot-search')
  getHotSearches(@Query('limit') limit?: string) {
    return this.topicsService.getHotSearches(parseInt(limit || '10'));
  }

  @Get('hot')
  getHotTopics(@Query('threshold') threshold?: string) {
    return this.topicsService.getHotTopics(parseInt(threshold || '5'));
  }

  @Post('search')
  @UseGuards(JwtAuthGuard)
  recordSearch(@Body('keyword') keyword: string) {
    return this.topicsService.recordSearch(keyword);
  }

  @Get('search')
  searchTopics(
    @Query('keyword') keyword: string,
    @Query('skip') skip?: string,
    @Query('take') take?: string,
  ) {
    return this.topicsService.searchTopics(
      keyword,
      parseInt(skip || '0'),
      parseInt(take || '20'),
    );
  }

  @Get()
  getAllTopics(
    @Query('skip') skip?: string,
    @Query('take') take?: string,
  ) {
    return this.topicsService.getTopics(
      parseInt(skip || '0'),
      parseInt(take || '20'),
    );
  }

  @Get(':name')
  getTopicByName(@Param('name') name: string) {
    const decodedName = decodeURIComponent(name);
    return this.topicsService.getTopicByName(decodedName);
  }

  @Get(':name/posts')
  getTopicPosts(
    @Param('name') name: string,
    @Query('skip') skip?: string,
    @Query('take') take?: string,
  ) {
    const decodedName = decodeURIComponent(name);
    return this.topicsService.getTopicPosts(
      decodedName,
      parseInt(skip || '0'),
      parseInt(take || '20'),
    );
  }

  @Post()
  @UseGuards(JwtAuthGuard)
  createTopic(
    @Body('name') name: string,
    @Body('description') description?: string,
  ) {
    return this.topicsService.createTopic(name, description);
  }
}
