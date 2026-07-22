import {
  URL,
  Video,
  VideoAbstract,
} from '@gitroom/nestjs-libraries/videos/video.interface';
import { IsObject, IsOptional, IsString } from 'class-validator';

/**
 * Remotion(브랜드 숏폼) video provider.
 * 외부 Remotion 렌더 서비스(noti-marketing/scripts/social/render-server.mjs)를 호출해
 * mp4 URL 을 돌려준다. Postiz 는 storage.uploadSimple(url) 로 Media 에 저장 후 게시/스케줄.
 *
 * env: REMOTION_RENDER_URL (예: http://render:7788 / http://localhost:7788)
 */
class RemotionParams {
  // v1 (레거시 .mjs 변형): 브랜드 슬러그 + registry variant id
  @IsOptional()
  @IsString()
  project?: string;

  @IsOptional()
  @IsString()
  id?: string;

  // v2 (DB 작성 변형): 브랜드 토큰/폰트 + 포맷 + spec 을 렌더타임 props 로
  @IsOptional()
  @IsObject()
  brand?: {
    tokens: Record<string, string>;
    fonts: { family: string; faces?: unknown[] };
    mascotPrefix?: string | null;
  };

  @IsOptional()
  @IsString()
  format?: string;

  @IsOptional()
  @IsObject()
  spec?: Record<string, unknown>;

  @IsOptional()
  @IsString()
  caption?: string;
}

@Video({
  identifier: 'remotion',
  title: 'Remotion (Brand Shorts)',
  description: 'Render brand short-form videos from the multi-tenant Remotion pipeline.',
  placement: 'text-to-image',
  dto: RemotionParams,
  tools: [],
  // 자체 렌더 서비스(과금 없음) — 트라이얼 게이트에 걸리지 않게 한다.
  trial: true,
  available: !!process.env.REMOTION_RENDER_URL,
})
export class Remotion extends VideoAbstract<RemotionParams> {
  override dto = RemotionParams;

  // 숏폼은 항상 9:16 세로 — 렌더 서비스가 1080x1920 로 렌더하므로 output 은 무시.
  async process(
    _output: 'vertical' | 'horizontal',
    customParams: RemotionParams
  ): Promise<URL> {
    const base = (process.env.REMOTION_RENDER_URL || 'http://localhost:7788').replace(
      /\/$/,
      ''
    );
    const res = await fetch(`${base}/render`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      // render-server 가 { brand|format } 이면 v2, 아니면 v1({project,id}) 로 분기하므로 그대로 전달.
      body: JSON.stringify(customParams),
    });
    const data = (await res.json()) as { ok: boolean; url?: string; error?: string };
    if (!data.ok || !data.url) {
      throw new Error(data.error || 'remotion render failed');
    }
    return data.url; // Postiz storage.uploadSimple 가 이 URL 을 fetch
  }
}
