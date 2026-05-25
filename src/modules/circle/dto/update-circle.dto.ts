import { IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateCircleDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @IsOptional()
  @IsString()
  avatarCid?: string;

  @IsOptional()
  @IsString()
  category?: string;
}
