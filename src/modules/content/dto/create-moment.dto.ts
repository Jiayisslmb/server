import { IsString, IsOptional, IsIn, MaxLength } from 'class-validator';

export class CreateMomentDto {
  @IsString()
  @MaxLength(5000)
  content: string;

  @IsOptional()
  @IsString()
  mediaCid?: string;

  @IsOptional()
  @IsString()
  mediaUrl?: string;

  @IsOptional()
  @IsString()
  tags?: string;

  @IsIn(['public', 'followers', 'private'])
  visibility: string = 'public';
}
