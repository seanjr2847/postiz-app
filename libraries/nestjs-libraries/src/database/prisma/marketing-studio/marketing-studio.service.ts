import { BadRequestException, Injectable } from '@nestjs/common';
import { Organization } from '@prisma/client';
import { MarketingStudioRepository } from '@gitroom/nestjs-libraries/database/prisma/marketing-studio/marketing-studio.repository';
import { MediaService } from '@gitroom/nestjs-libraries/database/prisma/media/media.service';
import { CreateBrandDto } from '@gitroom/nestjs-libraries/dtos/video-studio/create.brand.dto';
import { UpdateBrandDto } from '@gitroom/nestjs-libraries/dtos/video-studio/update.brand.dto';
import { CreateVariantDto } from '@gitroom/nestjs-libraries/dtos/video-studio/create.variant.dto';
import { UpdateVariantDto } from '@gitroom/nestjs-libraries/dtos/video-studio/update.variant.dto';
import { VideoDto } from '@gitroom/nestjs-libraries/dtos/videos/video.dto';
import { UploadFactory } from '@gitroom/nestjs-libraries/upload/upload.factory';

@Injectable()
export class MarketingStudioService {
  constructor(
    private _repository: MarketingStudioRepository,
    private _mediaService: MediaService
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
          slug: brand.slug, // 렌더 서비스가 브랜드 데모 에셋 유무 판별(없으면 페이오프 아웃트로 생략)
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

  private renderBase() {
    const base = process.env.REMOTION_RENDER_URL;
    if (!base) {
      throw new BadRequestException('REMOTION_RENDER_URL not configured');
    }
    return base.replace(/\/$/, '');
  }

  /**
   * 양산 임포트 — 렌더 서비스의 /registry/<slug> (정적 변형 + 덱/카드덱 생성 엔진 출력 전체)를
   * 가져와 없는 것만 변형으로 추가한다. 중복 판정은 (format, hook).
   */
  async importRegistry(orgId: string, brandId: string) {
    const brand = await this._repository.getBrand(orgId, brandId);
    if (!brand) {
      throw new BadRequestException('Brand not found');
    }

    const res = await fetch(`${this.renderBase()}/registry/${brand.slug}`);
    const data = (await res.json()) as {
      ok: boolean;
      error?: string;
      variants: Array<{
        sourceId: string;
        format: string;
        hook: string;
        caption: string;
        hashtags: string[];
        spec: Record<string, any>;
      }>;
    };
    if (!data.ok) {
      throw new BadRequestException(data.error || 'registry fetch failed');
    }

    const existing = await this._repository.getVariants(orgId, brandId);
    const seen = new Set(existing.map((v) => `${v.format} ${v.hook ?? ''}`));

    // repository.createVariant 는 DTO 검증을 안 거치므로 여기서 포맷을 걸러야 한다 —
    // 레지스트리엔 v2 제네릭으로 렌더 불가한 브랜드 서사 포맷(forgetting 등)도 섞여 있다.
    const renderable = new Set(['slides', 'cards', 'meme', 'ugc', 'hookcta']);

    let imported = 0;
    for (const v of data.variants) {
      if (!renderable.has(v.format)) continue;
      if (seen.has(`${v.format} ${v.hook}`)) continue;
      await this._repository.createVariant(orgId, {
        brandId,
        format: v.format,
        status: 'draft',
        hook: v.hook,
        spec: v.spec,
        caption: v.caption,
        hashtags: v.hashtags,
      } as CreateVariantDto);
      imported++;
    }
    return { imported, skipped: data.variants.length - imported };
  }

  /**
   * CLI 도구 프록시 — 렌더 서비스가 품고 있는 noti-marketing 스크립트를 HTTP 로 실행.
   * tool: scrape(yt-dlp 훅 수집) | stitch(훅+CTA 합성) | render-cta(CTA 클립) | mascot(fal 포즈 생성)
   */
  async runTool(tool: string, body: Record<string, any>) {
    const allowed = new Set(['scrape', 'stitch', 'render-cta', 'mascot']);
    if (!allowed.has(tool)) {
      throw new BadRequestException(`unknown tool '${tool}'`);
    }
    const res = await fetch(`${this.renderBase()}/${tool}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body ?? {}),
    });
    return res.json();
  }

  private _storage = UploadFactory.createStorage();

  /** 스티치 결과 mp4 URL 을 Postiz Media 로 업로드 — 컴포저에서 바로 쓸 수 있게. */
  async importStitched(orgId: string, urls: string[]) {
    const saved = [];
    for (const url of urls ?? []) {
      if (!url.startsWith(this.renderBase())) {
        throw new BadRequestException('url must point at the render service');
      }
      const file = await this._storage.uploadSimple(url);
      saved.push(
        await this._mediaService.saveFile(orgId, file.split('/').pop()!, file)
      );
    }
    return saved;
  }
}
