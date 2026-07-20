import {
  IsArray,
  IsObject,
  IsOptional,
  IsString,
} from 'class-validator';

export class CreateBrandDto {
  @IsString()
  slug: string;

  @IsString()
  name: string;

  @IsString()
  url: string;

  // JSON: { PAPER, INK, ACCENT, ... } (14 tokens) — stored stringified in the repository.
  @IsObject()
  tokens: Record<string, any>;

  // JSON: { family, faces } — stored stringified in the repository.
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
