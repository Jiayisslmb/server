//更新资料用

import { IsOptional, IsString, IsBoolean, IsEmail, MaxLength } from 'class-validator';

export class UpdateUserDto {
  @IsOptional()
  @IsString()
  @MaxLength(50)
  username?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  nickname?: string;

  @IsOptional()
  @IsString()
  bio?: string;

  @IsOptional()
  @IsString()
  avatarCid?: string;

  @IsOptional()
  @IsString()
  backgroundCid?: string;

  @IsOptional()
  @IsString()
  backgroundColor?: string;

  @IsOptional()
  @IsString()
  globalBackgroundCid?: string;

  @IsOptional()
  @IsString()
  globalBackgroundColor?: string;

  @IsOptional()
  @IsString()
  language?: string;

  @IsOptional()
  @IsString()
  fontSize?: string;

  @IsOptional()
  @IsString()
  colorScheme?: string;

  @IsOptional()
  @IsString()
  defaultVisibility?: string;

  @IsOptional()
  @IsEmail({}, { message: '邮箱格式不正确' })
  email?: string;

  @IsOptional()
  @IsString()
  website?: string;

  @IsOptional()
  @IsString()
  location?: string;

  @IsOptional()
  @IsString()
  notificationPreferences?: string;

  @IsOptional()
  @IsBoolean()
  allowFollow?: boolean;

  @IsOptional()
  @IsBoolean()
  allowMessage?: boolean;

  @IsOptional()
  @IsBoolean()
  hideFollowing?: boolean;

  @IsOptional()
  @IsBoolean()
  hideFollowers?: boolean;
}
