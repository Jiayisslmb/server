import { IsString, IsOptional, MaxLength, MinLength } from 'class-validator';

export class CreateCircleDto {
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  name: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @IsOptional()
  @IsString()
  avatarCid?: string; // 圈子头像 IPFS CID

  @IsString()
  category: string; // 分类
}
