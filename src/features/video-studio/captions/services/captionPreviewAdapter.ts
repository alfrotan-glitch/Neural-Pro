import type { CaptionRenderPlan } from './captionRenderPlan';
import { getCaptionThemeDefinition } from './captionThemeDefinitions';

export interface CaptionPreviewAdapterModel {
  clipId: string;
  className: string;
  theme: CaptionRenderPlan['theme'];
  activeWordIndex: number;
  activeSegmentIndex: number;
  activeWords: CaptionRenderPlan['timeline']['activeWords'];
}

export function toCaptionPreviewAdapter(plan: CaptionRenderPlan): CaptionPreviewAdapterModel {
  const definition = getCaptionThemeDefinition(plan.theme);
  return {
    clipId: plan.clipId,
    className: definition.previewClassName,
    theme: plan.theme,
    activeWordIndex: plan.timeline.activeIdx,
    activeSegmentIndex: plan.timeline.activeSegmentIndex,
    activeWords: plan.timeline.activeWords,
  };
}
