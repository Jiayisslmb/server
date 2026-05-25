import { Module } from '@nestjs/common';
import { IpfsService } from './utils/ipfs.service';
import { IpfsController } from './ipfs.controller';

@Module({
  controllers: [IpfsController],
  providers: [IpfsService],
  exports: [IpfsService],
})
export class IpfsModule {}
