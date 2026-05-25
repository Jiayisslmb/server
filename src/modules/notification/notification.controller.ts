import { Controller, Get, Post, Delete, Body, Param, Query, UseGuards, Request } from '@nestjs/common';
import { NotificationService } from './notification.service';
import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard';

@Controller('notifications')
@UseGuards(JwtAuthGuard)
export class NotificationController {
  constructor(private readonly notificationService: NotificationService) {}

  @Get()
  async getNotifications(
    @Request() req,
    @Query('type') type?: string,
    @Query('skip') skip?: string,
    @Query('take') take?: string,
  ) {
    return this.notificationService.getNotifications(
      req.user.id,
      type,
      parseInt(skip || '0'),
      parseInt(take || '20'),
    );
  }

  @Get('unread-count')
  async getUnreadCount(@Request() req) {
    return this.notificationService.getUnreadCount(req.user.id);
  }

  @Post(':id/read')
  async markAsRead(@Request() req, @Param('id') id: string) {
    return this.notificationService.markAsRead(req.user.id, parseInt(id));
  }

  @Post('read-all')
  async markAllAsRead(@Request() req, @Query('type') type?: string) {
    return this.notificationService.markAllAsRead(req.user.id, type);
  }

  @Delete(':id')
  async deleteNotification(@Request() req, @Param('id') id: string) {
    return this.notificationService.deleteNotification(req.user.id, parseInt(id));
  }

  @Post('batch-delete')
  async batchDeleteNotifications(
    @Request() req,
    @Body() body: { ids: number[] },
  ) {
    return this.notificationService.batchDeleteNotifications(req.user.id, body.ids);
  }
}
