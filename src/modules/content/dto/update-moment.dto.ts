import { IsOptional, IsString, IsIn } from 'class-validator';

export class UpdateMomentDto {
  @IsOptional()
  @IsString()
  content?: string;

  @IsOptional()
  @IsString()
  mediaCid?: string;

  @IsOptional()
  @IsIn(['public', 'followers', 'private'])
  visibility?: string;
}
