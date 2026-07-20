import {
  IsArray,
  IsIn,
  IsObject,
  IsOptional,
  IsString,
} from 'class-validator';

export class CreateVariantDto {
  @IsString()
  brandId: string;

  @IsIn(['slides', 'cards', 'meme', 'ugc', 'hookcta'])
  format: string;

  @IsIn(['draft', 'rendered', 'scheduled', 'published'])
  @IsOptional()
  status?: string;

  @IsString()
  @IsOptional()
  hook?: string;

  // JSON: format-specific fields (slides[], cards[], topText/bottomText, cta, demoSrc ...) — stored stringified.
  @IsObject()
  spec: Record<string, any>;

  @IsString()
  @IsOptional()
  caption?: string;

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  hashtags?: string[];
}
