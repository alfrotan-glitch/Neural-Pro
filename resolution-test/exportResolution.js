"use strict";
// src/core/engine/exportResolution.ts
Object.defineProperty(exports, "__esModule", { value: true });
exports.EXPORT_RESOLUTIONS = exports.EXPORT_RESOLUTION_SPECS = void 0;
exports.isExportResolution = isExportResolution;
exports.getExportDimensions = getExportDimensions;
exports.getExportResolutionSpec = getExportResolutionSpec;
exports.EXPORT_RESOLUTION_SPECS = {
    '720p': {
        value: '720p',
        width: 1280,
        height: 720,
        label: 'Standard HD (720p)',
        dimensionsLabel: '1280 × 720',
        description: 'Faster rendering, ideal for mobile previews',
    },
    '1080p': {
        value: '1080p',
        width: 1920,
        height: 1080,
        label: 'Full HD (1080p)',
        dimensionsLabel: '1920 × 1080',
        description: 'Recommended standard for web and social media',
    },
    '2K': {
        value: '2K',
        width: 2560,
        height: 1440,
        label: 'Quad HD (2K)',
        dimensionsLabel: '2560 × 1440',
        description: 'High sharpness and detailed professional presentations',
    },
    '4K': {
        value: '4K',
        width: 3840,
        height: 2160,
        label: 'Ultra HD (4K)',
        dimensionsLabel: '3840 × 2160',
        description: 'Cinematic quality with outstanding details',
    },
    '8K': {
        value: '8K',
        width: 7680,
        height: 4320,
        label: 'Super HD (8K)',
        dimensionsLabel: '7680 × 4320',
        description: 'Next generation highest clarity production format',
    },
};
exports.EXPORT_RESOLUTIONS = [
    '720p',
    '1080p',
    '2K',
    '4K',
    '8K',
];
/**
 * Runtime validation for values crossing persistence/UI/API boundaries.
 * Invalid values are rejected rather than silently mapped to another resolution.
 */
function isExportResolution(value) {
    return typeof value === 'string' && Object.prototype.hasOwnProperty.call(exports.EXPORT_RESOLUTION_SPECS, value);
}
/**
 * Returns the exact pixel dimensions for an export resolution.
 * There is intentionally no fallback resolution.
 */
function getExportDimensions(resolution) {
    return exports.EXPORT_RESOLUTION_SPECS[resolution];
}
function getExportResolutionSpec(resolution) {
    return exports.EXPORT_RESOLUTION_SPECS[resolution];
}
