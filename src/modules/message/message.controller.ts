// 消息控制器

import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  Request,
} from '@nestjs/common';
import { MessageService } from './message.service';
import { SendMessageDto } from './dto';
import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard';
import { ParseIntPipe } from '@nestjs/common';

@Controller('messages')
export class MessageController {
  constructor(private readonly messageService: MessageService) {}

  // 发送消息
  @Post(':receiverId')
  @UseGuards(JwtAuthGuard)
  sendMessage(
    @Param('receiverId', ParseIntPipe) receiverId: number,
    @Request() req,
    @Body() sendMessageDto: SendMessageDto,
  ) {
    return this.messageService.sendMessage(req.user.id, receiverId, sendMessageDto);
  }

  // 获取与某个用户的会话历史
  @Get('conversation/:userId')
  @UseGuards(JwtAuthGuard)
  getConversation(
    @Param('userId', ParseIntPipe) userId: number,
    @Request() req,
    @Query('skip') skip?: string,
    @Query('take') take?: string,
  ) {
    return this.messageService.getConversation(
      req.user.id,
      userId,
      parseInt(skip || '0'),
      parseInt(take || '50'),
    );
  }

  // 获取会话列表
  @Get('list')
  @UseGuards(JwtAuthGuard)
  getConversationList(@Request() req) {
    return this.messageService.getConversationList(req.user.id);
  }

  // 获取未读消息数
  @Get('unread/count')
  @UseGuards(JwtAuthGuard)
  getUnreadCount(@Request() req) {
    return this.messageService.getUnreadCount(req.user.id);
  }

  // 标记消息为已读
  @Post('mark-read/:senderId')
  @UseGuards(JwtAuthGuard)
  markAsRead(
    @Param('senderId', ParseIntPipe) senderId: number,
    @Request() req,
  ) {
    return this.messageService.markAsRead(req.user.id, senderId);
  }

  // 删除消息
  @Delete(':id')
  @UseGuards(JwtAuthGuard)
  deleteMessage(@Param('id', ParseIntPipe) id: number, @Request() req) {
    return this.messageService.deleteMessage(id, req.user.id);
  }
}
