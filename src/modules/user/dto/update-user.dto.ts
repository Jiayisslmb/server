//更新资料用

import { IsOptional, IsString, IsBoolean, MaxLength } from 'class-validator';

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
