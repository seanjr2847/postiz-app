import { PrismaRepository } from '@gitroom/nestjs-libraries/database/prisma/prisma.service';
import { Injectable } from '@nestjs/common';
import { CreateBrandDto } from '@gitroom/nestjs-libraries/dtos/video-studio/create.brand.dto';
import { UpdateBrandDto } from '@gitroom/nestjs-libraries/dtos/video-studio/update.brand.dto';
import { CreateVariantDto } from '@gitroom/nestjs-libraries/dtos/video-studio/create.variant.dto';
import { UpdateVariantDto } from '@gitroom/nestjs-libraries/dtos/video-studio/update.variant.dto';

@Injectable()
export class MarketingStudioRepository {
  constructor(
    private _brand: PrismaRepository<'marketingBrand'>,
    private _variant: PrismaRepository<'marketingVariant'>,
    private _media: PrismaRepository<'media'>
  ) {}

  // MarketingVariant.mediaId 는 FK 없는 느슨한 참조(스키마 변경 회피) — 렌더된
  // Media 의 path 를 프론트(컴포저 프리로드)가 쓰도록 여기서 수동 조인한다.
  private async attachMedia<
    T extends { mediaId: string | null } | null
  >(variants: T[]): Promise<T[]> {
    const ids = [
      ...new Set(
        variants.flatMap((v) => (v?.mediaId ? [v.mediaId] : []))
      ),
    ];
    if (!ids.length) {
      return variants.map((v) => (v ? { ...v, media: null } : v));
    }
    const media = await this._media.model.media.findMany({
      where: { id: { in: ids } },
      select: { id: true, path: true },
    });
    const byId = new Map(media.map((m) => [m.id, m]));
    return variants.map((v) =>
      v ? { ...v, media: v.mediaId ? byId.get(v.mediaId) ?? null : null } : v
    );
  }

  // ---- Brands ----

  getBrands(orgId: string) {
    return this._brand.model.marketingBrand.findMany({
      where: {
        organizationId: orgId,
        deletedAt: null,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });
  }

  getBrand(orgId: string, id: string) {
    return this._brand.model.marketingBrand.findFirst({
      where: {
        id,
        organizationId: orgId,
        deletedAt: null,
      },
    });
  }

  createBrand(orgId: string, body: CreateBrandDto) {
    return this._brand.model.marketingBrand.create({
      data: {
        organizationId: orgId,
        slug: body.slug,
        name: body.name,
        url: body.url,
        tokens: JSON.stringify(body.tokens),
        ...(body.fonts ? { fonts: JSON.stringify(body.fonts) } : {}),
        mascotPrefix: body.mascotPrefix,
        pillars: JSON.stringify(body.pillars || []),
      },
    });
  }

  updateBrand(orgId: string, id: string, body: UpdateBrandDto) {
    return this._brand.model.marketingBrand.update({
      where: {
        id,
        organizationId: orgId,
      },
      data: {
        ...(body.slug !== undefined ? { slug: body.slug } : {}),
        ...(body.name !== undefined ? { name: body.name } : {}),
        ...(body.url !== undefined ? { url: body.url } : {}),
        ...(body.tokens !== undefined
          ? { tokens: JSON.stringify(body.tokens) }
          : {}),
        ...(body.fonts !== undefined
          ? { fonts: JSON.stringify(body.fonts) }
          : {}),
        ...(body.mascotPrefix !== undefined
          ? { mascotPrefix: body.mascotPrefix }
          : {}),
        ...(body.pillars !== undefined
          ? { pillars: JSON.stringify(body.pillars) }
          : {}),
      },
    });
  }

  deleteBrand(orgId: string, id: string) {
    return this._brand.model.marketingBrand.update({
      where: {
        id,
        organizationId: orgId,
      },
      data: {
        deletedAt: new Date(),
      },
    });
  }

  // ---- Variants ----

  async getVariants(orgId: string, brandId?: string) {
    const variants = await this._variant.model.marketingVariant.findMany({
      where: {
        organizationId: orgId,
        deletedAt: null,
        ...(brandId ? { brandId } : {}),
      },
      orderBy: {
        createdAt: 'desc',
      },
    });
    return this.attachMedia(variants);
  }

  async getVariant(orgId: string, id: string) {
    const variant = await this._variant.model.marketingVariant.findFirst({
      where: {
        id,
        organizationId: orgId,
        deletedAt: null,
      },
    });
    return (await this.attachMedia([variant]))[0];
  }

  createVariant(orgId: string, body: CreateVariantDto) {
    return this._variant.model.marketingVariant.create({
      data: {
        organizationId: orgId,
        brandId: body.brandId,
        format: body.format,
        ...(body.status ? { status: body.status } : {}),
        hook: body.hook,
        spec: JSON.stringify(body.spec),
        caption: body.caption,
        hashtags: JSON.stringify(body.hashtags || []),
      },
    });
  }

  updateVariant(orgId: string, id: string, body: UpdateVariantDto) {
    return this._variant.model.marketingVariant.update({
      where: {
        id,
        organizationId: orgId,
      },
      data: {
        ...(body.format !== undefined ? { format: body.format } : {}),
        ...(body.status !== undefined ? { status: body.status } : {}),
        ...(body.hook !== undefined ? { hook: body.hook } : {}),
        ...(body.spec !== undefined ? { spec: JSON.stringify(body.spec) } : {}),
        ...(body.caption !== undefined ? { caption: body.caption } : {}),
        ...(body.hashtags !== undefined
          ? { hashtags: JSON.stringify(body.hashtags) }
          : {}),
      },
    });
  }

  deleteVariant(orgId: string, id: string) {
    return this._variant.model.marketingVariant.update({
      where: {
        id,
        organizationId: orgId,
      },
      data: {
        deletedAt: new Date(),
      },
    });
  }

  // Result of a render: link the produced Postiz Media and flip status.
  setVariantMedia(orgId: string, id: string, mediaId: string) {
    return this._variant.model.marketingVariant.update({
      where: {
        id,
        organizationId: orgId,
      },
      data: {
        mediaId,
        status: 'rendered',
      },
    });
  }
}
