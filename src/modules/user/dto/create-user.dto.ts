import { IsString, MinLength, MaxLength, IsOptional } from 'class-validator';

export class CreateUserDto {
  @IsString()
  @MinLength(3)
  @MaxLength(50)
  username: string;

  @IsString()
  @MinLength(6)
  password: string;

  @IsOptional()
  @IsString()
  bio?: string;

  @IsOptional()
  @IsString()
  nickname?: string;

  @IsString()
  captchaKey: string;

  @IsString()
  captchaAnswer: string;
}
