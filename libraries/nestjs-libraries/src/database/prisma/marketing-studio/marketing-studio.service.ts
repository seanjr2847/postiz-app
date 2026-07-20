import { BadRequestException, Injectable } from '@nestjs/common';
import { CreationMethod, Organization } from '@prisma/client';
import { MarketingStudioRepository } from '@gitroom/nestjs-libraries/database/prisma/marketing-studio/marketing-studio.repository';
import { MediaService } from '@gitroom/nestjs-libraries/database/prisma/media/media.service';
import { PostsService } from '@gitroom/nestjs-libraries/database/prisma/posts/posts.service';
import { CreateBrandDto } from '@gitroom/nestjs-libraries/dtos/video-studio/create.brand.dto';
import { UpdateBrandDto } from '@gitroom/nestjs-libraries/dtos/video-studio/update.brand.dto';
import { CreateVariantDto } from '@gitroom/nestjs-libraries/dtos/video-studio/create.variant.dto';
import { UpdateVariantDto } from '@gitroom/nestjs-libraries/dtos/video-studio/update.variant.dto';
import { VideoDto } from '@gitroom/nestjs-libraries/dtos/videos/video.dto';
import { CreatePostDto } from '@gitroom/nestjs-libraries/dtos/posts/create.post.dto';

@Injectable()
export class MarketingStudioService {
  constructor(
    private _repository: MarketingStudioRepository,
    private _mediaService: MediaService,
    private _postsService: PostsService
  ) {}

  // ---- Brands ----

  getBrands(orgId: string) {
    return this._repository.getBrands(orgId);
  }

  getBrand(orgId: string, id: string) {
    return this._repository.getBrand(orgId, id);
  }

  createBrand(orgId: string, body: CreateBrandDto) {
    return this._repository.createBrand(orgId, body);
  }

  updateBrand(orgId: string, id: string, body: UpdateBrandDto) {
    return this._repository.updateBrand(orgId, id, body);
  }

  deleteBrand(orgId: string, id: string) {
    return this._repository.deleteBrand(orgId, id);
  }

  // ---- Variants ----

  getVariants(orgId: string, brandId?: string) {
    return this._repository.getVariants(orgId, brandId);
  }

  getVariant(orgId: string, id: string) {
    return this._repository.getVariant(orgId, id);
  }

  createVariant(orgId: string, body: CreateVariantDto) {
    return this._repository.createVariant(orgId, body);
  }

  updateVariant(orgId: string, id: string, body: UpdateVariantDto) {
    return this._repository.updateVariant(orgId, id, body);
  }

  deleteVariant(orgId: string, id: string) {
    return this._repository.deleteVariant(orgId, id);
  }

  // ---- Actions ----

  /**
   * Render a variant through the existing Remotion video provider flow
   * (MediaService.generateVideo -> Remotion provider.process -> uploadSimple -> saveFile),
   * then link the produced Media onto the variant.
   */
  async render(orgId: string, variantId: string) {
    const variant = await this._repository.getVariant(orgId, variantId);
    if (!variant) {
      throw new BadRequestException('Variant not found');
    }

    const brand = await this._repository.getBrand(orgId, variant.brandId);
    if (!brand) {
      throw new BadRequestException('Brand not found');
    }

    const videoDto: VideoDto = {
      type: 'remotion',
      output: 'vertical',
      // NOTE: the existing Remotion provider (RemotionParams) renders by { project, id }
      // (render contract v1). Contract v2 — injecting brand tokens + format + spec as
      // props so DB content renders — is Phase 3.5 engine work. See video-studio-design.md §4.
      customParams: { project: brand.slug, id: variant.id },
    };

    // TODO(running-app): MediaService.generateVideo() needs the full Organization for
    // SubscriptionService credit/trial checks. In the running app, thread the Organization
    // from @GetOrgFromRequest() through the controller/service instead of this id-only stub.
    const org = { id: orgId } as Organization;

    const media = await this._mediaService.generateVideo(org, videoDto);

    await this._repository.setVariantMedia(orgId, variantId, media.id);
    return media;
  }

  /**
   * Schedule a rendered variant by creating a Postiz post (same path as the public API),
   * then link the produced Post onto the variant.
   */
  async schedule(orgId: string, variantId: string) {
    const variant = await this._repository.getVariant(orgId, variantId);
    if (!variant) {
      throw new BadRequestException('Variant not found');
    }

    if (!variant.mediaId) {
      throw new BadRequestException(
        'Variant must be rendered before it can be scheduled'
      );
    }

    // TODO(running-app): build the full CreatePostDto from the variant — resolve target
    // integration id(s), publish date/type (draft|schedule|now), attach the rendered Media
    // (variant.mediaId) as the post image, and use variant.caption + variant.hashtags for
    // the content. This mirrors the public POST /posts payload shape (see CreatePostDto).
    const dto = {
      type: 'schedule',
      date: new Date().toISOString(),
      shortLink: false,
      tags: [],
      posts: [],
    } as unknown as CreatePostDto;

    const result = await this._postsService.createPost(
      orgId,
      dto,
      CreationMethod.WEB
    );

    const postId = result?.[0]?.postId;
    if (postId) {
      await this._repository.setVariantPost(orgId, variantId, postId);
    }

    return result;
  }
}
