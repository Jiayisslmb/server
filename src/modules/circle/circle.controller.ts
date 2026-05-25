// 圈子控制器

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
import { CircleService } from './circle.service';
import { CreateCircleDto, UpdateCircleDto } from './dto';
import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard';
import { ParseIntPipe } from '@nestjs/common';

@Controller('circles')
export class CircleController {
  constructor(private readonly circleService: CircleService) {}

  // 创建圈子
  @Post()
  @UseGuards(JwtAuthGuard)
  createCircle(@Request() req, @Body() createCircleDto: CreateCircleDto) {
    return this.circleService.createCircle(req.user.id, createCircleDto);
  }

  // 获取圈子列表
  @Get()
  getCircles(@Query('skip') skip?: string, @Query('take') take?: string) {
    return this.circleService.getCircles(
      parseInt(skip || '0'),
      parseInt(take || '20'),
    );
  }

  // 搜索圈子
  @Get('search')
  searchCircles(
    @Query('keyword') keyword: string,
    @Query('skip') skip?: string,
    @Query('take') take?: string,
  ) {
    return this.circleService.searchCircles(
      keyword,
      parseInt(skip || '0'),
      parseInt(take || '20'),
    );
  }

  // 获取圈子详情
  @Get(':id')
  getCircleById(@Param('id', ParseIntPipe) id: number) {
    return this.circleService.getCircleById(id);
  }

  // 更新圈子
  @Patch(':id')
  @UseGuards(JwtAuthGuard)
  updateCircle(
    @Param('id', ParseIntPipe) id: number,
    @Request() req,
    @Body() updateCircleDto: UpdateCircleDto,
  ) {
    return this.circleService.updateCircle(id, req.user.id, updateCircleDto);
  }

  // 删除圈子
  @Delete(':id')
  @UseGuards(JwtAuthGuard)
  deleteCircle(@Param('id', ParseIntPipe) id: number, @Request() req) {
    return this.circleService.deleteCircle(id, req.user.id);
  }

  // 加入圈子
  @Post(':id/join')
  @UseGuards(JwtAuthGuard)
  joinCircle(@Param('id', ParseIntPipe) id: number, @Request() req) {
    return this.circleService.joinCircle(id, req.user.id);
  }

  // 离开圈子
  @Post(':id/leave')
  @UseGuards(JwtAuthGuard)
  leaveCircle(@Param('id', ParseIntPipe) id: number, @Request() req) {
    return this.circleService.leaveCircle(id, req.user.id);
  }

  // 获取圈子成员
  @Get(':id/members')
  getCircleMembers(
    @Param('id', ParseIntPipe) id: number,
    @Query('skip') skip?: string,
    @Query('take') take?: string,
  ) {
    return this.circleService.getCircleMembers(
      id,
      parseInt(skip || '0'),
      parseInt(take || '20'),
    );
  }

  // 获取圈子内的动态
  @Get(':id/posts')
  getCirclePosts(
    @Param('id', ParseIntPipe) id: number,
    @Query('skip') skip?: string,
    @Query('take') take?: string,
  ) {
    return this.circleService.getCirclePosts(
      id,
      parseInt(skip || '0'),
      parseInt(take || '20'),
    );
  }

  // 获取用户加入的圈子
  @Get('user/:userId')
  @UseGuards(JwtAuthGuard)
  getUserCircles(
    @Param('userId', ParseIntPipe) userId: number,
    @Query('skip') skip?: string,
    @Query('take') take?: string,
  ) {
    return this.circleService.getUserCircles(
      userId,
      parseInt(skip || '0'),
      parseInt(take || '20'),
    );
  }
}
