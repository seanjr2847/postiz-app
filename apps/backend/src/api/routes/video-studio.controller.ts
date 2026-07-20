import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { GetOrgFromRequest } from '@gitroom/nestjs-libraries/user/org.from.request';
import { Organization } from '@prisma/client';
import { ApiTags } from '@nestjs/swagger';
import { MarketingStudioService } from '@gitroom/nestjs-libraries/database/prisma/marketing-studio/marketing-studio.service';
import { CreateBrandDto } from '@gitroom/nestjs-libraries/dtos/video-studio/create.brand.dto';
import { UpdateBrandDto } from '@gitroom/nestjs-libraries/dtos/video-studio/update.brand.dto';
import { CreateVariantDto } from '@gitroom/nestjs-libraries/dtos/video-studio/create.variant.dto';
import { UpdateVariantDto } from '@gitroom/nestjs-libraries/dtos/video-studio/update.variant.dto';

@ApiTags('VideoStudio')
@Controller('/video-studio')
export class VideoStudioController {
  constructor(private _marketingStudioService: MarketingStudioService) {}

  // ---- Brands ----

  @Get('/brands')
  getBrands(@GetOrgFromRequest() org: Organization) {
    return this._marketingStudioService.getBrands(org.id);
  }

  @Get('/brands/:id')
  getBrand(
    @GetOrgFromRequest() org: Organization,
    @Param('id') id: string
  ) {
    return this._marketingStudioService.getBrand(org.id, id);
  }

  @Post('/brands')
  createBrand(
    @GetOrgFromRequest() org: Organization,
    @Body() body: CreateBrandDto
  ) {
    return this._marketingStudioService.createBrand(org.id, body);
  }

  @Put('/brands/:id')
  updateBrand(
    @GetOrgFromRequest() org: Organization,
    @Param('id') id: string,
    @Body() body: UpdateBrandDto
  ) {
    return this._marketingStudioService.updateBrand(org.id, id, body);
  }

  @Delete('/brands/:id')
  deleteBrand(
    @GetOrgFromRequest() org: Organization,
    @Param('id') id: string
  ) {
    return this._marketingStudioService.deleteBrand(org.id, id);
  }

  // ---- Variants ----

  @Get('/variants')
  getVariants(
    @GetOrgFromRequest() org: Organization,
    @Query('brandId') brandId?: string
  ) {
    return this._marketingStudioService.getVariants(org.id, brandId);
  }

  @Get('/variants/:id')
  getVariant(
    @GetOrgFromRequest() org: Organization,
    @Param('id') id: string
  ) {
    return this._marketingStudioService.getVariant(org.id, id);
  }

  @Post('/variants')
  createVariant(
    @GetOrgFromRequest() org: Organization,
    @Body() body: CreateVariantDto
  ) {
    return this._marketingStudioService.createVariant(org.id, body);
  }

  @Put('/variants/:id')
  updateVariant(
    @GetOrgFromRequest() org: Organization,
    @Param('id') id: string,
    @Body() body: UpdateVariantDto
  ) {
    return this._marketingStudioService.updateVariant(org.id, id, body);
  }

  @Delete('/variants/:id')
  deleteVariant(
    @GetOrgFromRequest() org: Organization,
    @Param('id') id: string
  ) {
    return this._marketingStudioService.deleteVariant(org.id, id);
  }

  @Post('/variants/:id/render')
  renderVariant(
    @GetOrgFromRequest() org: Organization,
    @Param('id') id: string
  ) {
    return this._marketingStudioService.render(org.id, id);
  }

  @Post('/variants/:id/schedule')
  scheduleVariant(
    @GetOrgFromRequest() org: Organization,
    @Param('id') id: string
  ) {
    return this._marketingStudioService.schedule(org.id, id);
  }
}
