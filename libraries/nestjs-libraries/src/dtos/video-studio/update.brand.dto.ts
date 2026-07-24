import {
  IsArray,
  IsObject,
  IsOptional,
  IsString,
} from 'class-validator';

export class UpdateBrandDto {
  @IsString()
  @IsOptional()
  slug?: string;

  @IsString()
  @IsOptional()
  name?: string;

  @IsString()
  @IsOptional()
  url?: string;

  @IsObject()
  @IsOptional()
  tokens?: Record<string, any>;

  @IsObject()
  @IsOptional()
  fonts?: Record<string, any>;

  @IsString()
  @IsOptional()
  mascotPrefix?: string;

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  pillars?: string[];
}
