import { IsString, IsOptional, MaxLength } from 'class-validator';

export class SendMessageDto {
  @IsString()
  @MaxLength(5000)
  content: string;

  @IsOptional()
  @IsString()
  mediaCid?: string; // 媒体 IPFS CID
}
