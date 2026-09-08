import React from 'react';
import { useInspectorController } from '../InspectorController';
import { UniversalTransformControls } from '../UniversalTransformControls';

export const VisualElementInspectorPanel: React.FC = () => {
  const { activeNode, trackType } = useInspectorController();
  return (
    <div id="visual_element_inspector_panel" className="space-y-3">
      <div className="bg-[#111218] border border-white/5 rounded-xl p-3">
        <div className="text-[10px] uppercase font-black tracking-wider text-cyan-400">{trackType ?? 'visual'} element</div>
        <div className="text-[9px] text-gray-500 mt-1 truncate">{activeNode.properties.name || activeNode.properties.title || activeNode.id}</div>
      </div>
      <UniversalTransformControls id="generic_visual_universal_transform" />
    </div>
  );
};
