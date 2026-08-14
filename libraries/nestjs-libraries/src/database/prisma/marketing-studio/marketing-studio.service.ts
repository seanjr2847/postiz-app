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

// 미디어 선택창(컴포저 포함)에 뜨는 이름 — 프론트 FORMAT_LABELS 와 같은 말을 쓴다.
const FORMAT_LABEL: Record<string, string> = {
  slides: '슬라이드',
  cards: '카드',
  meme: '밈',
  ugc: 'UGC 반응',
  hookcta: '훅 + CTA',
};

const mediaLabel = (
  brandName: string,
  variant: { format: string; hook: string | null }
) =>
  [
    brandName,
    FORMAT_LABEL[variant.format] ?? variant.format,
    variant.hook?.trim().slice(0, 60) || null,
  ]
    .filter(Boolean)
    .join(' · ');

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

  async getVariants(org: Organization, brandId?: string) {
    const variants = await this._repository.getVariants(org.id, brandId);
    // 자가 복구 — 프로세스가 큐 도중 죽으면 queued 가 아무도 안 집는 채로 남는다.
    // 목록을 볼 때마다 펌프를 깨운다(멱등: 이미 돌고 있으면 즉시 반환).
    if (variants.some((v) => v?.renderState === 'queued')) {
      this.pumpRenderQueue(org).catch(() => {});
    }
    return variants;
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
    await this._repository.renameMedia(media.id, mediaLabel(brand.name, variant));
    return media;
  }

  // ---- 렌더 큐 (서버 소유) ----
  //
  // 예전엔 브라우저가 큐를 들고 렌더를 한 건씩 동기 POST 로 돌렸다. 새로고침하거나 탭을 닫으면
  // 큐가 통째로 증발했고(도는 중이던 렌더만 서버에서 살아남았다), 남은 항목은 아무도 안 집었다.
  // 이제 큐는 DB(변형 행의 render* 필드)에 있고 이 프로세스의 펌프가 소비한다 —
  // 브라우저는 목록을 폴링해 상태를 비추기만 한다.
  //
  // ponytail: 펌프는 이 프로세스 안에만 있다(백엔드 1인스턴스 전제). 인스턴스를 늘리면
  //           두 펌프가 같은 항목을 집을 수 있다 — 그때 DB 레벨 claim(조건부 update)으로 올린다.

  /** 렌더 도중 죽은 것으로 보는 시간. 가장 긴 실측 렌더가 70초대라 넉넉히 잡았다. */
  private static readonly RENDER_STALE_MS = 15 * 60 * 1000;

  /** 지금 펌프가 도는 조직. 같은 조직에 펌프가 둘 붙지 않게 한다. */
  private _pumping = new Set<string>();

  /** 큐에 넣고 펌프를 깨운다. 응답은 기다리지 않는다 — 진행은 목록 폴링으로 본다. */
  async enqueueRenders(org: Organization, variantIds: string[]) {
    if (!variantIds?.length) {
      throw new BadRequestException('variantIds required');
    }
    const queued = await this._repository.enqueueRender(org.id, variantIds);
    this.pumpRenderQueue(org).catch(() => {});
    return { queued };
  }

  abortRenders(orgId: string) {
    return this._repository.abortQueuedRenders(orgId);
  }

  clearRenderQueue(orgId: string) {
    return this._repository.clearFinishedRenders(orgId);
  }

  /** 대기 항목이 없어질 때까지 한 건씩 렌더한다. 실패는 큐를 멈추지 않는다. */
  async pumpRenderQueue(org: Organization) {
    if (this._pumping.has(org.id)) {
      return;
    }
    this._pumping.add(org.id);
    try {
      await this._repository.reapStaleRenders(
        org.id,
        new Date(Date.now() - MarketingStudioService.RENDER_STALE_MS)
      );
      for (;;) {
        const next = await this._repository.nextQueuedRender(org.id);
        if (!next) {
          return;
        }
        await this._repository.markRenderRunning(org.id, next.id);
        const startedAt = Date.now();
        try {
          await this.render(org, next.id);
          await this._repository.finishRender(
            org.id,
            next.id,
            'done',
            Date.now() - startedAt
          );
        } catch (e: any) {
          await this._repository.finishRender(
            org.id,
            next.id,
            'failed',
            Date.now() - startedAt,
            String(e?.message ?? e).slice(0, 300)
          );
        }
      }
    } finally {
      this._pumping.delete(org.id);
    }
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
