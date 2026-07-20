import {
  URL,
  Video,
  VideoAbstract,
} from '@gitroom/nestjs-libraries/videos/video.interface';
import { IsString } from 'class-validator';

/**
 * Remotion(브랜드 숏폼) video provider.
 * 외부 Remotion 렌더 서비스(noti-marketing/scripts/social/render-server.mjs)를 호출해
 * mp4 URL 을 돌려준다. Postiz 는 storage.uploadSimple(url) 로 Media 에 저장 후 게시/스케줄.
 *
 * env: REMOTION_RENDER_URL (예: http://render:7788 / http://localhost:7788)
 */
class RemotionParams {
  @IsString()
  project: string; // 브랜드 슬러그 (noti · ai-tierlist · moneyorphony ...)

  @IsString()
  id: string; // 변형 id (브랜드 registry ALL 의 variant.id)
}

@Video({
  identifier: 'remotion',
  title: 'Remotion (Brand Shorts)',
  description: 'Render brand short-form videos from the multi-tenant Remotion pipeline.',
  placement: 'text-to-image',
  dto: RemotionParams,
  tools: [],
  trial: false,
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
      body: JSON.stringify({ project: customParams.project, id: customParams.id }),
    });
    const data = (await res.json()) as { ok: boolean; url?: string; error?: string };
    if (!data.ok || !data.url) {
      throw new Error(data.error || 'remotion render failed');
    }
    return data.url; // Postiz storage.uploadSimple 가 이 URL 을 fetch
  }
}
