import type { ProjectState, Track } from '../../../features/video-studio/project/types/project';
import { CaptionRenderer } from '../CaptionRenderer';
import { normalizeCyberpunkSubscribeProperties, CYBERPUNK_LOGO_PRESETS } from '../cyberpunkSubscribeModel';

import { buildPreviewCompositorIndex, selectActivePreviewCompositorPlan, type PreviewCompositorIndex } from '../../../features/video-studio/playback/compositor/previewCompositorIndex';
import { getMediaFrameGeometry } from '../../../features/video-studio/playback/services/mediaFrameGeometry';
import { getMediaVisualEffects } from '../../../features/video-studio/playback/services/mediaVisualEffects';
import { getImageToVideoAnimationState } from '../../../features/video-studio/playback/services/imageToVideoAnimation';
import { getCanonicalClipTransform, getCanvasTransformTranslation } from '../../../features/video-studio/playback/services/clipTransformModel';
import { normalizeCustomSubscribeProperties, getCustomSubscribeAnimationStage, getCustomSubscribeStageOpacity } from '../customSubscribeRenderModel';
import { evaluateClipAnimation } from '../../../features/video-studio/animation/services';
import type { AtomicRenderSnapshot } from '../../../features/video-studio/playback/services/atomicRenderSnapshot';
export interface CanvasExportRenderContext {
  state: ProjectState;
  imageCache: ReadonlyMap<string, CanvasImageSource>;
  mediaByClipId: ReadonlyMap<string, HTMLVideoElement>;
  renderSnapshot?: AtomicRenderSnapshot;
}

/** Deterministic Native Web frame compositor. */
export class CanvasExportRenderer {
  private readonly compositorIndexCache = new WeakMap<readonly Track[], PreviewCompositorIndex>();

  private getCompositorIndex(tracks: readonly Track[]): PreviewCompositorIndex {
    const cached = this.compositorIndexCache.get(tracks);
    if (cached) return cached;
    const index = buildPreviewCompositorIndex(tracks);
    this.compositorIndexCache.set(tracks, index);
    return index;
  }
  public render = (canvas: HTMLCanvasElement, ctx: CanvasRenderingContext2D, width: number, height: number, frameTime: number | undefined, context: CanvasExportRenderContext) => {
    const state = context.state;
    const time = frameTime !== undefined ? frameTime : state.currentTime;

    // 1. Draw solid dark background
    ctx.fillStyle = '#06070a';
    ctx.fillRect(0, 0, width, height);

    // 2. Draw all visual layers in the same canonical order as Preview.
    // The shared compositor ordering is: background → video → overlay → text.
    // Audio tracks participate in the active plan for timing but are not canvas layers.
    const compositorIndex = this.getCompositorIndex(state.tracks);
    const activePlan = selectActivePreviewCompositorPlan(compositorIndex, time);
    const snapshot = context.renderSnapshot;
    const activeVideoLayers = snapshot?.byRole.video ?? activePlan.byRole.video;
    const activeTextLayers = snapshot?.byRole.text ?? activePlan.byRole.text;
    const activeOverlayLayers = snapshot?.byRole.overlay ?? activePlan.byRole.overlay;

    activeVideoLayers.forEach(({ clip }) => {
      ctx.save();
      const canonicalTransform = context.renderSnapshot?.transformByClipId[clip.id] ?? evaluateClipAnimation(state.animations, clip, time);
      const imageToVideoState = getImageToVideoAnimationState(clip, time);
      const translated = getCanvasTransformTranslation({ ...canonicalTransform, x: imageToVideoState.x, y: imageToVideoState.y, scale: imageToVideoState.scale }, width, height);
      ctx.translate(translated.x, translated.y);
      ctx.rotate((canonicalTransform.rotation * Math.PI) / 180);
      const scaleFactor = imageToVideoState.scale / 100;
      const scaleX = (canonicalTransform.scaleX ?? 100) / 100;
      const scaleY = (canonicalTransform.scaleY ?? 100) / 100;
      ctx.scale(scaleFactor * scaleX, scaleFactor * scaleY);
      ctx.globalAlpha = canonicalTransform.opacity / 100;
      const mediaVisualEffects = getMediaVisualEffects(clip.properties || {});
      ctx.filter = mediaVisualEffects.canvasFilter;
      ctx.globalCompositeOperation = mediaVisualEffects.canvasCompositeOperation;
      // Keep export media geometry identical to the Preview's canonical 85% frame.
      // Transform math remains centered on the full composition canvas; only the
      // inner media frame is inset, matching the Preview DOM contract.
      const mediaFrame = getMediaFrameGeometry(width, height);
      const boxWidth = mediaFrame.width;
      const boxHeight = mediaFrame.height;
      const drawX = -boxWidth / 2;
      const drawY = -boxHeight / 2;
      let drawn = false;
      if (clip.properties.videoUrl) {
        const videoEl = context.mediaByClipId.get(clip.id);
        if (videoEl && videoEl.readyState >= 2) {
          const vw = videoEl.videoWidth;
          const vh = videoEl.videoHeight;
          if (vw && vh) {
            const scale = Math.max(boxWidth / vw, boxHeight / vh);
            const drawW = vw * scale;
            const drawH = vh * scale;
            ctx.drawImage(videoEl, drawX + (boxWidth - drawW) / 2, drawY + (boxHeight - drawH) / 2, drawW, drawH);
          } else {
            ctx.drawImage(videoEl, drawX, drawY, boxWidth, boxHeight);
          }
          drawn = true;
        }
      } else if (clip.properties.imageUrl) {
        const imageSource = context.imageCache.get(clip.properties.imageUrl);
        if (imageSource) {
          const iw = 'width' in imageSource ? Number(imageSource.width) : 0;
          const ih = 'height' in imageSource ? Number(imageSource.height) : 0;
          if (iw > 0 && ih > 0) {
            const scale = Math.max(boxWidth / iw, boxHeight / ih);
            const drawW = iw * scale;
            const drawH = ih * scale;
            ctx.drawImage(imageSource, drawX + (boxWidth - drawW) / 2, drawY + (boxHeight - drawH) / 2, drawW, drawH);
          } else {
            ctx.drawImage(imageSource, drawX, drawY, boxWidth, boxHeight);
          }
          drawn = true;
        }
      }
      if (!drawn) {
        const grad = ctx.createLinearGradient(drawX, drawY, drawX + boxWidth, drawY + boxHeight);
        grad.addColorStop(0, '#a855f7');
        grad.addColorStop(1, '#6366f1');
        ctx.fillStyle = grad;
        ctx.fillRect(drawX, drawY, boxWidth, boxHeight);
        ctx.fillStyle = '#ffffff';
        ctx.font = `bold ${boxHeight * 0.08}px Inter`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(clip.properties.name || 'Media Clip', 0, 0);
      }
      ctx.restore();
    });

    // 3. Draw overlays before text so the canonical compositor z-order is preserved.
    activeOverlayLayers.forEach(({ clip }) => {
      try {
        this.renderOverlayClip(ctx, clip, time, width, height, context);
      } catch (err) {
        console.error("Failed to render overlay clip onto export canvas:", err);
      }
    });

    // 4. Draw active caption / text clips directly using CaptionRenderer.
    activeTextLayers.forEach(({ clip }) => {
      if (!clip.properties?.textContent) return;
      try {
        CaptionRenderer.renderToCanvas(ctx, clip, time, { width, height });
      } catch (err) {
        console.error("Failed to render caption clip via CaptionRenderer:", err);
      }
    });
  }

  private renderOverlayClip = (ctx: CanvasRenderingContext2D, clip: any, time: number, width: number, height: number, context: CanvasExportRenderContext) => {
    ctx.save();

    // 1. Position and Transform
    const canonicalTransform = context.renderSnapshot?.transformByClipId[clip.id] ?? evaluateClipAnimation(context.state.animations, clip, time);
    const translated = getCanvasTransformTranslation(canonicalTransform, width, height);
    ctx.translate(translated.x, translated.y);

    ctx.rotate((canonicalTransform.rotation * Math.PI) / 180);

    const scaleFactor = canonicalTransform.scale / 100;
    const scaleX = (canonicalTransform.scaleX ?? 100) / 100;
    const scaleY = (canonicalTransform.scaleY ?? 100) / 100;
    ctx.scale(scaleFactor * scaleX, scaleFactor * scaleY);

    ctx.globalAlpha = canonicalTransform.opacity / 100;

    const sourceId = clip.sourceId || '';
    const props = clip.properties || {};
    const name = props.name || 'Overlay';
    const textContent = props.textContent || props.name || '';
    const customSubscribeProps = normalizeCustomSubscribeProperties(props);
    const channelTitle = props.channelTitle || props.channelName || customSubscribeProps.brandName || props.name || textContent;
    const channelSubtitle = props.channelSubtitle || props.subtitle;

    // Overlay content lives inside the same canonical 85% composition frame
    // as Preview. Keep transform translation relative to the full canvas, but
    // derive all overlay sizing from the inset frame so Preview and Export use
    // the same coordinate basis without removing any existing overlay types.
    const overlayFrame = getMediaFrameGeometry(width, height);
    const overlayWidth = overlayFrame.width;
    const overlayHeight = overlayFrame.height;

    // Standard bounding dimensions
    const w = overlayWidth;
    const h = overlayHeight;
    const drawX = -w / 2;
    const drawY = -h / 2;

    const drawRoundRect = (x: number, y: number, rw: number, rh: number, radius: number) => {
      ctx.beginPath();
      if (typeof ctx.roundRect === 'function') {
        ctx.roundRect(x, y, rw, rh, radius);
      } else {
        ctx.rect(x, y, rw, rh);
      }
    };

    // A. Audio Wave Overlay (Dynamic Spectrum Visualizer - supports neo-bars, fluid-wave, retro-eq, radial-pulse, cyber-sine)
    if (sourceId === 'st_audio_wave_overlay' || sourceId === 'ef_audio_wave_overlay' || sourceId.includes('audio_wave') || sourceId.includes('wave')) {
      const waveW = overlayWidth;
      const waveH = overlayHeight;
      const waveX = -waveW / 2;
      const waveY = -waveH / 2;

      const styleMode = props.styleMode || 'neo-bars';
      const waveColor = props.waveColor || 'cyan';

      let color1 = '#06b6d4', color2 = '#3b82f6', color3 = '#a855f7';
      if (waveColor === 'emerald') { color1 = '#10b981'; color2 = '#14b8a6'; color3 = '#06b6d4'; }
      else if (waveColor === 'pink') { color1 = '#ec4899'; color2 = '#f43f5e'; color3 = '#a855f7'; }
      else if (waveColor === 'amber') { color1 = '#f59e0b'; color2 = '#f97316'; color3 = '#ef4444'; }
      else if (waveColor === 'indigo') { color1 = '#6366f1'; color2 = '#8b5cf6'; color3 = '#a855f7'; }
      else if (waveColor === 'white') { color1 = '#ffffff'; color2 = '#e4e4e7'; color3 = '#a1a1aa'; }

      if (styleMode === 'fluid-wave') {

        ctx.beginPath();
        const barCount = 48;
        ctx.moveTo(waveX + 16, waveY + waveH / 2);
        for (let i = 0; i < barCount; i++) {
          const bx = waveX + 16 + (i / (barCount - 1)) * (waveW - 32);
          const wave1 = Math.sin(time * 8 + i * 0.4) * 0.4;
          const wave2 = Math.cos(time * 5 - i * 0.25) * 0.35;
          const hFactor = Math.max(0.1, Math.min(0.9, 0.45 + wave1 + wave2));
          const by = waveY + waveH / 2 + (i % 2 === 0 ? -1 : 1) * (waveH * 0.38) * hFactor;
          ctx.lineTo(bx, by);
        }
        ctx.strokeStyle = color1;
        ctx.lineWidth = 3;
        if (props.glowEffect !== false) ctx.shadowColor = color1;
        if (props.glowEffect !== false) ctx.shadowBlur = 10;
        ctx.stroke();
        ctx.shadowBlur = 0;
      }
      else if (styleMode === 'neo-bars' || styleMode === 'neo_bars') {
        const barCount = 48;
        const totalW = waveW - 24;
        const barW = Math.max(3, (totalW / barCount) - 3);

        for (let i = 0; i < barCount; i++) {
          const bx = waveX + 12 + i * (barW + 3);
          const norm = i / barCount;
          const window = Math.pow(Math.sin(norm * Math.PI), 1.2);
          const wave1 = Math.sin(time * 9 + i * 0.4) * 0.35;
          const wave2 = Math.cos(time * 6 - i * 0.2) * 0.3;
          const hFactor = Math.max(0.12, Math.min(0.95, (0.35 + Math.abs(wave1 + wave2)) * window));
          const barH = (waveH - 24) * hFactor;
          const by = waveY + (waveH - barH) / 2;

          const grad = ctx.createLinearGradient(0, by, 0, by + barH);
          grad.addColorStop(0, color1);
          grad.addColorStop(0.5, color2);
          grad.addColorStop(1, color3);

          ctx.fillStyle = grad;
          if (props.glowEffect !== false) {
            ctx.shadowColor = color2;
            if (props.glowEffect !== false) ctx.shadowBlur = 12;
          }
          drawRoundRect(bx, by, barW, barH, barW / 2);
          ctx.fill();
          ctx.shadowBlur = 0;
        }
      }
      else if (styleMode === 'retro-eq') {
        const columns = 20;
        const colW = (waveW - 32) / columns;
        for (let i = 0; i < columns; i++) {
          const cx = waveX + 16 + i * colW;
          const wave = Math.sin(time * 10 + i * 0.5) * 0.4 + 0.5;
          const litGrids = Math.floor(wave * 8) + 1;

          for (let g = 0; g < 8; g++) {
            const gy = waveY + waveH - 16 - g * 8;
            if (g < litGrids) {
              if (g >= 6) ctx.fillStyle = '#ef4444';
              else if (g >= 4) ctx.fillStyle = '#f97316';
              else ctx.fillStyle = '#10b981';
            } else {
              ctx.fillStyle = 'rgba(255, 255, 255, 0.08)';
            }
            drawRoundRect(cx + 2, gy, colW - 4, 6, 2);
            ctx.fill();
          }
        }
      }
      else if (styleMode === 'radial-pulse') {
        const r = waveH * 0.38;
        ctx.strokeStyle = color1;
        ctx.lineWidth = 2.5;
        if (props.glowEffect !== false) ctx.shadowColor = color1;
        if (props.glowEffect !== false) ctx.shadowBlur = 12;
        ctx.beginPath();
        ctx.arc(0, 0, r, 0, Math.PI * 2);
        ctx.stroke();
        ctx.shadowBlur = 0;

        const spikes = 32;
        for (let i = 0; i < spikes; i++) {
          const angle = (i / spikes) * Math.PI * 2;
          const wave = Math.sin(time * 12 + i * 0.4) * 0.4 + 0.5;
          const outerR = r + wave * (waveH * 0.35);
          const x1 = Math.cos(angle) * r;
          const y1 = Math.sin(angle) * r;
          const x2 = Math.cos(angle) * outerR;
          const y2 = Math.sin(angle) * outerR;

          ctx.beginPath();
          ctx.moveTo(x1, y1);
          ctx.lineTo(x2, y2);
          ctx.strokeStyle = color2;
          ctx.lineWidth = 2;
          ctx.stroke();
        }
      }
      else {
        ctx.beginPath();
        const barCount = 60;
        for (let i = 0; i < barCount; i++) {
          const bx = waveX + (i / (barCount - 1)) * waveW;
          const by = Math.sin(time * 14 + i * 0.3) * (waveH * 0.35);
          if (i === 0) ctx.moveTo(bx, by);
          else ctx.lineTo(bx, by);
        }
        ctx.strokeStyle = color1;
        ctx.lineWidth = 3.5;
        if (props.glowEffect !== false) ctx.shadowColor = color1;
        ctx.shadowBlur = 15;
        ctx.stroke();
        ctx.shadowBlur = 0;
      }
    }
    // B. Cyberpunk Subscribe Template
    else if (sourceId === 'st_cyber_sub' || sourceId === 'ef_cyber_sub' || sourceId.includes('cyber')) {
      const w = overlayWidth;
      const h = overlayHeight;
      const drawX = -w / 2;
      const drawY = -h / 2;

      ctx.fillStyle = 'rgba(3, 4, 8, 0.94)';
      drawRoundRect(drawX, drawY, w, h, 16);
      ctx.fill();

      ctx.strokeStyle = '#06b6d4';
      ctx.lineWidth = 2.5;
      ctx.shadowColor = '#06b6d4';
      if (props.glowEffect !== false) ctx.shadowBlur = 10;
      ctx.stroke();
      ctx.shadowBlur = 0;

      ctx.fillStyle = '#a855f7';
      ctx.font = `bold ${Math.round(h * 0.11)}px monospace`;
      ctx.textAlign = 'left';
      ctx.fillText("SYS_MONITOR // RENDER_ENG_V4", drawX + 16, drawY + h * 0.18);

      const avatarR = h * 0.24;
      const avatarX = drawX + h * 0.35;
      const avatarY = 0;
      ctx.fillStyle = '#0f172a';
      ctx.beginPath();
      ctx.arc(avatarX, avatarY, avatarR, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#06b6d4';
      ctx.lineWidth = 2;
      ctx.stroke();

      const cyberProps = normalizeCyberpunkSubscribeProperties(props);
      const logoPreset = CYBERPUNK_LOGO_PRESETS.find((logo) => logo.id === cyberProps.logoPresetId) ?? CYBERPUNK_LOGO_PRESETS[1];
      const nameText = cyberProps.channelName.toUpperCase();

      // Persisted logo is part of the project state. Never read it from the mounted DOM.
      const customLogo = cyberProps.customLogoUrl
        ? context.imageCache.get(cyberProps.customLogoUrl)
        : undefined;

      if (customLogo) {
        ctx.save();
        ctx.beginPath();
        ctx.arc(avatarX, avatarY, avatarR, 0, Math.PI * 2);
        ctx.clip();
        ctx.drawImage(customLogo, avatarX - avatarR, avatarY - avatarR, avatarR * 2, avatarR * 2);
        ctx.restore();
      } else {
        ctx.fillStyle = '#ffffff';
        ctx.font = `bold ${Math.round(avatarR * 1.1)}px Arial`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        if (logoPreset) {
          ctx.fillText(logoPreset.emoji, avatarX, avatarY);
        }
      }

      ctx.fillStyle = '#67e8f9';
      ctx.font = `bold ${Math.round(h * 0.18)}px monospace`;
      ctx.textAlign = 'left';
      ctx.fillText(nameText, avatarX + avatarR + 16, -h * 0.08);

      ctx.fillStyle = '#c084fc';
      ctx.font = `bold ${Math.round(h * 0.11)}px monospace`;
      ctx.fillText("EST. 2026 • NETRUNNER APPROVED", avatarX + avatarR + 16, h * 0.16);

      const btnW = w * 0.30;
      const btnH = h * 0.32;
      const btnX = drawX + w - btnW - 16;
      const btnY = drawY + h - btnH - 12;

      const gradSub = ctx.createLinearGradient(btnX, btnY, btnX + btnW, btnY);
      if (cyberProps.subscribed) {
        gradSub.addColorStop(0, '#00ffcc');
        gradSub.addColorStop(1, '#06b6d4');
      } else {
        gradSub.addColorStop(0, '#ff007f');
        gradSub.addColorStop(1, '#9333ea');
      }
      ctx.fillStyle = gradSub;
      drawRoundRect(btnX, btnY, btnW, btnH, 8);
      ctx.fill();

      ctx.fillStyle = '#ffffff';
      ctx.font = `bold ${Math.round(btnH * 0.42)}px monospace`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(cyberProps.subscribed ? "✓ SUBSCRIBED" : "⚡ SUBSCRIBE", btnX + btnW / 2, btnY + btnH / 2);

      ctx.fillStyle = cyberProps.liked ? '#00ffcc' : '#94a3b8';
      ctx.font = `bold ${Math.round(h * 0.10)}px monospace`;
      ctx.textAlign = 'left';
      ctx.fillText(cyberProps.liked ? '♥ LIKED' : '♡ LIKE', drawX + 16, drawY + h - 14);

      ctx.fillStyle = cyberProps.notificationsEnabled ? '#fbbf24' : '#64748b';
      ctx.textAlign = 'right';
      ctx.fillText(cyberProps.notificationsEnabled ? '🔔 ALERTS ON' : '🔕 ALERTS OFF', drawX + w - 16, drawY + h - 14);
    }
    // C. Neon Capsule Subscribe Template
    else if (sourceId === 'st_neon_capsule' || sourceId === 'ef_neon_capsule') {
      const w = Math.min(Math.max(0, overlayWidth - 32), 896);
      const h = Math.min(Math.max(0, overlayHeight - 32), 112);
      const drawX = -w / 2;
      const drawY = -h / 2;

      ctx.fillStyle = 'rgba(13, 15, 25, 0.90)';
      drawRoundRect(drawX, drawY, w, h, h / 2);
      ctx.fill();

      const borderGrad = ctx.createLinearGradient(drawX, drawY, drawX + w, drawY + h);
      borderGrad.addColorStop(0, '#ec4899');
      borderGrad.addColorStop(0.5, '#9333ea');
      borderGrad.addColorStop(1, '#06b6d4');
      ctx.strokeStyle = borderGrad;
      ctx.lineWidth = 3;
      ctx.stroke();

      const avatarR = h * 0.32;
      const avatarX = drawX + h * 0.55;
      const avatarY = 0;
      ctx.fillStyle = '#000000';
      ctx.beginPath();
      ctx.arc(avatarX, avatarY, avatarR, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#ec4899';
      ctx.lineWidth = 2;
      ctx.stroke();

      ctx.fillStyle = '#ffffff';
      ctx.font = `bold ${Math.round(avatarR * 0.9)}px Arial`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText("🎧", avatarX, avatarY);

      ctx.fillStyle = '#ffffff';
      ctx.font = `bold ${Math.round(h * 0.24)}px Inter, sans-serif`;
      ctx.textAlign = 'left';
      ctx.fillText(channelTitle || "English Unleashed", avatarX + avatarR + 14, -h * 0.12);

      ctx.fillStyle = '#cbd5e1';
      ctx.font = `bold ${Math.round(h * 0.15)}px Inter, sans-serif`;
      ctx.fillText(channelSubtitle || "Subscribe Us", avatarX + avatarR + 14, h * 0.18);

      const likeW = w * 0.15;
      const likeH = h * 0.50;
      const likeX = drawX + w - likeW - (w * 0.32) - 24;
      const likeY = -likeH / 2;
      ctx.fillStyle = 'rgba(6, 182, 212, 0.15)';
      drawRoundRect(likeX, likeY, likeW, likeH, likeH / 2);
      ctx.fill();
      ctx.strokeStyle = '#06b6d4';
      ctx.lineWidth = 1.5;
      ctx.stroke();

      ctx.fillStyle = '#22d3ee';
      ctx.font = `bold ${Math.round(likeH * 0.38)}px Inter, sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillText("👍 LIKE", likeX + likeW / 2, 0);

      const btnW = w * 0.28;
      const btnH = h * 0.54;
      const btnX = drawX + w - btnW - 14;
      const btnY = -btnH / 2;

      ctx.fillStyle = '#ef4444';
      ctx.shadowColor = '#ef4444';
      if (props.glowEffect !== false) ctx.shadowBlur = 10;
      drawRoundRect(btnX, btnY, btnW, btnH, btnH / 2);
      ctx.fill();
      ctx.shadowBlur = 0;

      ctx.fillStyle = '#ffffff';
      ctx.font = `bold ${Math.round(btnH * 0.36)}px Inter, sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillText("SUBSCRIBE", btnX + btnW / 2, 0);
    }
    // D. Retro Synthwave / Outrun Template
    else if (sourceId === 'st_neon_outrun' || sourceId === 'ef_neon_outrun') {
      const w = overlayWidth;
      const h = overlayHeight;
      const drawX = -w / 2;
      const drawY = -h / 2;

      ctx.fillStyle = '#0a0518';
      drawRoundRect(drawX, drawY, w, h, 14);
      ctx.fill();

      ctx.strokeStyle = '#ec4899';
      ctx.lineWidth = 2;
      ctx.stroke();

      ctx.fillStyle = '#f472b6';
      ctx.font = `bold ${Math.round(h * 0.22)}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText("🌌 RETRO_OUTRUN", 0, -h * 0.15);

      ctx.fillStyle = '#9ca3af';
      ctx.font = `bold ${Math.round(h * 0.12)}px monospace`;
      ctx.fillText("EST. 1988 • CODESWEEP", 0, h * 0.10);

      const btnW = w * 0.45;
      const btnH = h * 0.28;
      const btnX = -btnW / 2;
      const btnY = drawY + h - btnH - 12;

      ctx.fillStyle = 'rgba(236, 72, 153, 0.2)';
      drawRoundRect(btnX, btnY, btnW, btnH, 6);
      ctx.fill();
      ctx.strokeStyle = '#ec4899';
      ctx.lineWidth = 1.5;
      ctx.stroke();

      ctx.fillStyle = '#f472b6';
      ctx.font = `bold ${Math.round(btnH * 0.45)}px monospace`;
      ctx.fillText("SUBSCRIBE", 0, btnY + btnH / 2);
    }
    // E. Glassmorphism Minimal Template
    else if (sourceId === 'st_glass_minimal' || sourceId === 'ef_glass_minimal') {
      const w = overlayWidth;
      const h = overlayHeight;
      const drawX = -w / 2;
      const drawY = -h / 2;

      ctx.fillStyle = 'rgba(255, 255, 255, 0.08)';
      drawRoundRect(drawX, drawY, w, h, 16);
      ctx.fill();

      ctx.strokeStyle = 'rgba(255, 255, 255, 0.25)';
      ctx.lineWidth = 1.5;
      ctx.stroke();

      ctx.fillStyle = '#ffffff';
      ctx.font = `bold ${Math.round(h * 0.24)}px Inter, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText("💎 GLASSM_STUDIO", 0, -h * 0.14);

      ctx.fillStyle = '#9ca3af';
      ctx.font = `${Math.round(h * 0.14)}px Inter, sans-serif`;
      ctx.fillText("Creative Design Hub", 0, h * 0.12);
    }
    // F. Classic YouTube Creator Template
    else if (sourceId === 'st_classic_youtube' || sourceId === 'ef_classic_youtube') {
      const w = overlayWidth;
      const h = overlayHeight;
      const drawX = -w / 2;
      const drawY = -h / 2;

      ctx.fillStyle = '#0f0f0f';
      drawRoundRect(drawX, drawY, w, h, 12);
      ctx.fill();

      ctx.strokeStyle = 'rgba(220, 38, 38, 0.3)';
      ctx.lineWidth = 1.5;
      ctx.stroke();

      const avatarR = h * 0.28;
      const avatarX = drawX + h * 0.45;
      const avatarY = 0;
      ctx.fillStyle = '#dc2626';
      ctx.beginPath();
      ctx.arc(avatarX, avatarY, avatarR, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#ffffff';
      ctx.font = `bold ${Math.round(avatarR)}px Arial`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText("🔔", avatarX, avatarY);

      ctx.fillStyle = '#ffffff';
      ctx.font = `bold ${Math.round(h * 0.22)}px Inter, sans-serif`;
      ctx.textAlign = 'left';
      ctx.fillText("CREATOR_PRO", avatarX + avatarR + 14, -h * 0.10);

      ctx.fillStyle = '#9ca3af';
      ctx.font = `${Math.round(h * 0.15)}px Inter, sans-serif`;
      ctx.fillText("128,450 subscribers", avatarX + avatarR + 14, h * 0.18);

      const btnW = w * 0.28;
      const btnH = h * 0.48;
      const btnX = drawX + w - btnW - 14;
      const btnY = -btnH / 2;

      ctx.fillStyle = '#cc0000';
      drawRoundRect(btnX, btnY, btnW, btnH, 8);
      ctx.fill();

      ctx.fillStyle = '#ffffff';
      ctx.font = `bold ${Math.round(btnH * 0.36)}px Inter, sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillText("SUBSCRIBE", btnX + btnW / 2, 0);
    }
    // G. Matrix Hacker Glitch Template
    else if (sourceId === 'st_matrix_glitch' || sourceId === 'ef_matrix_glitch') {
      const w = overlayWidth;
      const h = overlayHeight;
      const drawX = -w / 2;
      const drawY = -h / 2;

      ctx.fillStyle = '#020d04';
      drawRoundRect(drawX, drawY, w, h, 10);
      ctx.fill();

      ctx.strokeStyle = '#22c55e';
      ctx.lineWidth = 2;
      ctx.stroke();

      ctx.fillStyle = '#4ade80';
      ctx.font = `bold ${Math.round(h * 0.18)}px monospace`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText("SYSTEM://NETROOT_GATEWAY", 0, -h * 0.22);

      ctx.fillStyle = '#22c55e';
      ctx.font = `bold ${Math.round(h * 0.14)}px monospace`;
      ctx.fillText(`[ SUBSCRIBE_COMMAND: PENDING ]`, 0, 0);

      const btnW = w * 0.45;
      const btnH = h * 0.28;
      const btnX = -btnW / 2;
      const btnY = drawY + h - btnH - 10;

      ctx.fillStyle = '#22c55e';
      drawRoundRect(btnX, btnY, btnW, btnH, 4);
      ctx.fill();

      ctx.fillStyle = '#000000';
      ctx.font = `bold ${Math.round(btnH * 0.45)}px monospace`;
      ctx.fillText("★ SUBSCRIBE", 0, btnY + btnH / 2);
    }
    // H. Custom Subscribe Generator Widget
    else if (sourceId === 'st_custom_subscribe' || sourceId === 'ef_custom_subscribe') {
      const w = overlayWidth;
      const h = overlayHeight;
      const drawX = -w / 2;
      const drawY = -h / 2;
      const localTime = Math.max(0, time - Number(clip.startAt || 0));
      const stage = getCustomSubscribeAnimationStage(localTime, customSubscribeProps.animationSpeed);
      const stageOpacity = getCustomSubscribeStageOpacity(stage);
      if (stageOpacity <= 0) { ctx.restore(); return; }

      const innerH = Math.min(h * 0.34, 120);
      const cardW = Math.min(w * 0.76, 760);
      const cardX = -cardW / 2;
      const cardY = -innerH / 2;
      const radius = customSubscribeProps.buttonStyle === 'square' ? 6 : customSubscribeProps.buttonStyle === 'rounded' ? 14 : innerH / 2;
      ctx.globalAlpha *= stageOpacity;

      // Transparent composition matches the DOM generator: only the animated banner is painted.
      ctx.fillStyle = 'rgba(10, 10, 10, 0.90)';
      drawRoundRect(cardX, cardY, cardW, innerH, radius);
      ctx.fill();
      ctx.strokeStyle = customSubscribeProps.colors.borderColor;
      ctx.lineWidth = Math.max(1.5, h * 0.012);
      ctx.stroke();

      const avatarSize = innerH * 0.70;
      const avatarX = cardX + avatarSize * 0.68;
      const avatarY = 0;
      ctx.save();
      ctx.beginPath();
      ctx.arc(avatarX, avatarY, avatarSize / 2, 0, Math.PI * 2);
      ctx.clip();
      const logo = customSubscribeProps.logoImage ? context.imageCache.get(customSubscribeProps.logoImage) : undefined;
      if (logo) ctx.drawImage(logo, avatarX - avatarSize / 2, avatarY - avatarSize / 2, avatarSize, avatarSize);
      else {
        ctx.fillStyle = '#27272a';
        ctx.fill();
        ctx.fillStyle = customSubscribeProps.colors.primaryColor;
        ctx.font = `${Math.round(avatarSize * 0.45)}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('✦', avatarX, avatarY);
      }
      ctx.restore();

      const textX = avatarX + avatarSize * 0.72;
      if (stage >= 2) {
        ctx.fillStyle = customSubscribeProps.colors.brandNameColor;
        ctx.font = `${customSubscribeProps.fontWeight} ${Math.max(12, Math.round(h * 0.065))}px ${customSubscribeProps.fontFamily}, sans-serif`;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText(channelTitle || "English Unleashed", textX, -innerH * 0.10);
      }

      if (stage >= 3) {
        ctx.fillStyle = customSubscribeProps.colors.likeColor;
        ctx.font = `bold ${Math.max(11, Math.round(h * 0.055))}px sans-serif`;
        ctx.fillText(stage >= 4 ? '♥ LIKED' : '♡ LIKE', textX, innerH * 0.28);
      }

      if (stage >= 5) {
        const btnW = Math.min(cardW * 0.27, 180);
        const btnH = innerH * 0.46;
        const btnX = cardX + cardW - btnW - innerH * 0.95;
        const btnY = -btnH / 2;
        ctx.fillStyle = stage >= 6 ? 'rgba(255,255,255,0.10)' : customSubscribeProps.colors.subscribeColor;
        drawRoundRect(btnX, btnY, btnW, btnH, customSubscribeProps.buttonStyle === 'square' ? 4 : customSubscribeProps.buttonStyle === 'rounded' ? 8 : btnH / 2);
        ctx.fill();
        ctx.fillStyle = stage >= 6 ? customSubscribeProps.colors.secondaryColor : '#ffffff';
        ctx.font = `bold ${Math.max(10, Math.round(btnH * 0.38))}px ${customSubscribeProps.fontFamily}, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(stage >= 6 ? 'Subscribed ✓' : 'Subscribe', btnX + btnW / 2, 0);
      }

      if (stage >= 7) {
        const bellX = cardX + cardW - innerH * 0.43;
        ctx.fillStyle = stage >= 8 ? customSubscribeProps.colors.bellColor : customSubscribeProps.colors.secondaryColor;
        ctx.font = `${Math.max(18, Math.round(innerH * 0.38))}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.fillText('🔔', bellX, 0);
      }
    }
    else if (sourceId === 'st_sub' || sourceId === 'ef_sub') {
      const w = overlayWidth;
      const h = overlayHeight;
      const drawX = -w / 2;
      const drawY = -h / 2;
      ctx.fillStyle = '#090b11';
      drawRoundRect(drawX, drawY, w, h, 16);
      ctx.fill();
      ctx.strokeStyle = '#ff0055';
      ctx.lineWidth = Math.max(1.5, h * 0.012);
      ctx.stroke();
      ctx.fillStyle = '#ffffff';
      ctx.font = `bold ${Math.round(h * 0.22)}px Inter, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('🔔 ' + (props.name || 'Subscribe'), 0, -h * 0.08);
      ctx.fillStyle = '#9ca3af';
      ctx.font = `${Math.round(h * 0.12)}px Inter, sans-serif`;
      ctx.fillText(props.textContent || "Don't miss our latest content!", 0, h * 0.18);
    }
    // I. Image Sticker or Uploaded Asset
    else if (props.imageUrl) {
      const imageSource = context.imageCache.get(props.imageUrl);
      if (imageSource) {
        ctx.drawImage(imageSource, drawX, drawY, w, h);
      } else {
        ctx.fillStyle = 'rgba(168, 85, 247, 0.2)';
        drawRoundRect(drawX, drawY, w, h, 12);
        ctx.fill();
        ctx.strokeStyle = '#a855f7';
        ctx.lineWidth = 2;
        ctx.stroke();

        ctx.fillStyle = '#ffffff';
        ctx.font = `bold ${Math.round(h * 0.22)}px Inter, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(name, 0, 0);
      }
    }
    // J. Generic Sticker / Effect Badge
    else {
      ctx.fillStyle = 'rgba(15, 23, 42, 0.88)';
      drawRoundRect(drawX, drawY, w, h, 14);
      ctx.fill();

      ctx.strokeStyle = '#ec4899';
      ctx.lineWidth = 2;
      ctx.stroke();

      ctx.fillStyle = '#ffffff';
      ctx.font = `bold ${Math.round(h * 0.26)}px Inter, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(props.thumbnail || '✨', 0, -h * 0.15);

      ctx.font = `bold ${Math.round(h * 0.22)}px Inter, sans-serif`;
      ctx.fillText(name, 0, h * 0.2);
    }

    ctx.restore();
  }
}
