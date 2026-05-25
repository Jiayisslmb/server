import { IsString, IsOptional, IsIn, MaxLength, IsNumber } from 'class-validator';

export class CreateArticleDto {
  @IsString()
  @MaxLength(200)
  title: string;

  @IsString()
  content: string;

  @IsOptional()
  @IsString()
  coverCid?: string;

  @IsOptional()
  @IsString()
  mediaCid?: string;

  @IsOptional()
  @IsString()
  tags?: string;

  @IsIn(['public', 'followers', 'private'])
  visibility: string = 'public';

  @IsOptional()
  @IsNumber()
  circleId?: number;
}
