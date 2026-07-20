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
  async render(org: Organization, variantId: string) {
    const variant = await this._repository.getVariant(org.id, variantId);
    if (!variant) {
      throw new BadRequestException('Variant not found');
    }

    const brand = await this._repository.getBrand(org.id, variant.brandId);
    if (!brand) {
      throw new BadRequestException('Brand not found');
    }

    // 렌더 계약 v2 — DB 브랜드 토큰/폰트 + 포맷 + spec 을 렌더타임 input props 로 넘겨
    // format-<format> 제네릭 컴포지션을 렌더(render-server v2). JSON 컬럼은 파싱.
    const videoDto: VideoDto = {
      type: 'remotion',
      output: 'vertical',
      customParams: {
        brand: {
          tokens: JSON.parse(brand.tokens),
          fonts: JSON.parse(brand.fonts),
          mascotPrefix: brand.mascotPrefix,
        },
        format: variant.format,
        spec: JSON.parse(variant.spec),
        caption: variant.caption ?? undefined,
      },
    };

    // 전체 Organization 전달(SubscriptionService 크레딧/트라이얼 체크) — 컨트롤러가
    // @GetOrgFromRequest() 로 받은 org 를 그대로 넘긴다.
    const media = await this._mediaService.generateVideo(org, videoDto);

    await this._repository.setVariantMedia(org.id, variantId, media.id);
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
