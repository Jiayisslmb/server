import { IsString, IsOptional, IsArray, IsBoolean } from 'class-validator';

export class SendMessageDto {
  @IsArray()
  messages: Array<{ role: string; content: string; imageUrl?: string }>;

  @IsOptional()
  conversationId?: number;

  @IsOptional()
  @IsString()
  model?: string;

  @IsOptional()
  @IsString()
  mode?: 'fast' | 'deep' | 'auto';
}

export class CreateConversationDto {
  @IsString()
  title: string;

  @IsOptional()
  @IsString()
  model?: string;
}

export class UpdateProfileDto {
  @IsOptional()
  @IsString()
  language?: string;

  @IsOptional()
  @IsString()
  interests?: string;

  @IsOptional()
  @IsString()
  expertise?: string;

  @IsOptional()
  @IsBoolean()
  autoLearn?: boolean;
}
