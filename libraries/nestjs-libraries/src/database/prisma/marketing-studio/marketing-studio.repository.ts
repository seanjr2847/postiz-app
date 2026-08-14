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

  // 렌더 결과 Media 는 업로드 파일명(해시.mp4)으로 저장돼서 미디어 선택창에서
  // 어느 브랜드의 무슨 영상인지 알 수가 없었다 — 사람이 읽을 이름을 박아준다.
  renameMedia(id: string, name: string) {
    return this._media.model.media.update({
      where: { id },
      data: { name },
    });
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

  // ---- 렌더 큐 ----
  // 큐를 변형 행 위에 얹는다. 별도 job 테이블을 안 쓰는 이유: 프론트가 이미 변형 목록을
  // 폴링하므로 큐 상태가 그 응답에 실려 오면 조회 엔드포인트가 하나도 안 늘어난다.

  /** 큐에 넣는다(이미 큐에 있던 결과는 덮어쓴다). 등록 순서를 renderQueuedAt 에 굳힌다. */
  async enqueueRender(orgId: string, ids: string[]) {
    // 같은 밀리초에 여러 건이 들어가면 정렬이 무너져 "지금 무엇이 도는가"가 뒤섞인다 —
    // 인덱스만큼 밀어 등록 순서를 그대로 남긴다.
    const base = Date.now();
    let queued = 0;
    for (const [i, id] of ids.entries()) {
      const { count } = await this._variant.model.marketingVariant.updateMany({
        where: { id, organizationId: orgId, deletedAt: null },
        data: {
          renderState: 'queued',
          renderError: null,
          renderQueuedAt: new Date(base + i),
          renderStartedAt: null,
          renderMs: null,
        },
      });
      queued += count;
    }
    return queued;
  }

  /** 다음 대기 항목 1건. 렌더 서비스가 1건씩 처리하므로 큐도 직렬이다. */
  nextQueuedRender(orgId: string) {
    return this._variant.model.marketingVariant.findFirst({
      where: { organizationId: orgId, renderState: 'queued', deletedAt: null },
      orderBy: { renderQueuedAt: 'asc' },
    });
  }

  markRenderRunning(orgId: string, id: string) {
    return this._variant.model.marketingVariant.updateMany({
      where: { id, organizationId: orgId },
      data: { renderState: 'running', renderStartedAt: new Date() },
    });
  }

  finishRender(
    orgId: string,
    id: string,
    state: 'done' | 'failed',
    ms: number,
    error?: string
  ) {
    return this._variant.model.marketingVariant.updateMany({
      where: { id, organizationId: orgId },
      data: { renderState: state, renderMs: ms, renderError: error ?? null },
    });
  }

  /** 남은 대기분만 중단 — 도는 중인 1건은 끝까지 간다(중간에 끊으면 반쪽 mp4 가 남는다). */
  abortQueuedRenders(orgId: string) {
    return this._variant.model.marketingVariant.updateMany({
      where: { organizationId: orgId, renderState: 'queued' },
      data: { renderState: 'aborted' },
    });
  }

  /** 끝난 것만 큐에서 치운다(사용자의 "큐 지우기"). 대기·진행 중은 건드리지 않는다. */
  clearFinishedRenders(orgId: string) {
    return this._variant.model.marketingVariant.updateMany({
      where: {
        organizationId: orgId,
        renderState: { in: ['done', 'failed', 'aborted'] },
      },
      data: { renderState: null, renderError: null, renderQueuedAt: null },
    });
  }

  /**
   * 백엔드가 렌더 도중 죽으면 running 이 영영 남아 UI 가 계속 "렌더 중"을 보여준다.
   * 펌프를 켤 때마다 오래된 running 을 실패로 떨군다.
   */
  reapStaleRenders(orgId: string, olderThan: Date) {
    return this._variant.model.marketingVariant.updateMany({
      where: {
        organizationId: orgId,
        renderState: 'running',
        renderStartedAt: { lt: olderThan },
      },
      data: {
        renderState: 'failed',
        renderError: '렌더 중 서버가 재시작됐습니다 — 다시 렌더하세요',
      },
    });
  }
}
