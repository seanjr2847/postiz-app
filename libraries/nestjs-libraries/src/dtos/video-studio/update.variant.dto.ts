import {
  IsArray,
  IsIn,
  IsObject,
  IsOptional,
  IsString,
} from 'class-validator';

export class UpdateVariantDto {
  @IsIn(['slides', 'cards', 'meme', 'ugc', 'hookcta'])
  @IsOptional()
  format?: string;

  @IsIn(['draft', 'rendered', 'scheduled', 'published'])
  @IsOptional()
  status?: string;

  @IsString()
  @IsOptional()
  hook?: string;

  @IsObject()
  @IsOptional()
  spec?: Record<string, any>;

  @IsString()
  @IsOptional()
  caption?: string;

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  hashtags?: string[];
}
