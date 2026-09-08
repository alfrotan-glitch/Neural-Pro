export const INSPECTOR_REGISTRY = {
  video: [
    { category: 'Transform', controls: ['position', 'scale', 'rotation', 'opacity'] },
    { category: 'AI Tools', controls: ['removeBackground', 'opticalFlow'] }
  ],
  audio: [
    { category: 'Volume', controls: ['levelDb', 'pan'] },
    { category: 'AI Enhance', controls: ['noiseReduction', 'enhanceVoice'] }
  ],
  text: [
    { category: 'Transform', controls: ['position', 'scale', 'rotation', 'opacity'] },
    { category: 'Typography', controls: ['fontFamily', 'fontSize', 'color'] }
  ],
  effect: [
    { category: 'Effect Properties', controls: ['intensity'] }
  ]
};
