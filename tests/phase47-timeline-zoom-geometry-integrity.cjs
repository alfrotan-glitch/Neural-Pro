const fs = require('fs');
const assert = require('assert');

const file = 'src/components/timeline/VirtualizedTimeline.tsx';
const text = fs.readFileSync(file, 'utf8');

assert(text.includes('useEffect(() => {\n    const workspace = workspaceRef.current;'), 'zoom geometry effect must exist');
assert(text.includes('pixelsPerSecond\n    );\n    setVisibleTimeRange') || text.includes('pixelsPerSecond,\n    );\n    setVisibleTimeRange'), 'visible range must use current pixelsPerSecond');
assert(text.includes('newPixelsPerSecond\n              ));') || text.includes('newPixelsPerSecond,\n              ));'), 'ctrl/cmd wheel must recompute range with new zoom');
assert(text.includes('basePixelsPerSecond * newZoom\n            ));') || text.includes('basePixelsPerSecond * newZoom,\n          ));'), 'fit-to-screen must use new zoom for range');

console.log('PHASE47_TIMELINE_ZOOM_GEOMETRY=PASS');
