// src/store/useExportStore.ts
import { create } from 'zustand';
import { generateUUID } from '../lib/uuid';
import {
  calculateRecommendedVideoBitrate,
  validateVideoBitrate,
} from '../core/engine/exportEncodingSettings';

import type {
  ExportJob,
  ExportJobSettings,
  ExportJobStatus,
  ExportSettingsState,
  ExportResolution,
  ExportFPS,
  ExportCodec,
  ExportQuality,
  AudioBitrate,
  ExportFormat,
  ExportProjectSnapshot,
} from '../features/video-studio/export/types';

export type {
  ExportJob,
  ExportJobSettings,
  ExportJobStatus,
  ExportSettingsState,
  ExportResolution,
  ExportFPS,
  ExportCodec,
  ExportQuality,
  AudioBitrate,
  ExportFormat,
};

export type ExportSettings = ExportSettingsState;

interface ExportStore extends ExportSettings {
  setResolution: (res: ExportResolution) => void;
  setFps: (fps: ExportFPS) => void;
  setCodec: (codec: ExportCodec) => void;
  setVideoBitrateMode: (mode: 'auto' | 'custom') => void;
  setQuality: (quality: ExportQuality) => void;
  setAudioBitrate: (bitrate: AudioBitrate) => void;
  setVideoBitrate: (bitrate: number) => void;
  setFormat: (format: ExportFormat) => void;
  setIsExporting: (isExporting: boolean) => void;
  setExportProgress: (progress: number) => void;
  resetSettings: () => void;
  
  // Job Queue Operations
  addJob: (projectName: string, settings: ExportJob['settings'], projectSnapshot: ExportProjectSnapshot) => string;
  removeJob: (jobId: string) => void;
  /**
   * Reset a job so the export scheduler can dispatch a NEW run (attempt + 1).
   * Cancellation is *not* a store operation: the workflow runtime owns run
   * status and mirrors it here one-way (ADR-011, D-010).
   */
  retryJob: (jobId: string) => void;
  updateJob: (jobId: string, updates: Partial<ExportJob>) => void;
  clearQueue: () => void;
}

const initialSettings: ExportSettings = {
  resolution: '1080p',
  fps: 30,
  codec: 'H.264',
  quality: 'Balanced',
  audioBitrate: '192k',
  videoBitrate: 8_000_000,
  videoBitrateMode: 'auto',
  format: 'mp4',
  isExporting: false,
  exportProgress: 0,
  jobs: [],
};

export const useExportStore = create<ExportStore>((set, get) => ({
  ...initialSettings,
  setResolution: (resolution) => set((state) => ({
    resolution,
    ...(state.videoBitrateMode === 'auto'
      ? { videoBitrate: calculateRecommendedVideoBitrate(resolution, state.fps, state.quality, state.codec) }
      : {}),
  })),
  setFps: (fps) => set((state) => ({
    fps,
    ...(state.videoBitrateMode === 'auto'
      ? { videoBitrate: calculateRecommendedVideoBitrate(state.resolution, fps, state.quality, state.codec) }
      : {}),
  })),
  setCodec: (codec) => set((state) => ({
    codec,
    ...(state.videoBitrateMode === 'auto'
      ? { videoBitrate: calculateRecommendedVideoBitrate(state.resolution, state.fps, state.quality, codec) }
      : {}),
  })),
  setQuality: (quality) => set((state) => ({
    quality,
    ...(state.videoBitrateMode === 'auto'
      ? { videoBitrate: calculateRecommendedVideoBitrate(state.resolution, state.fps, quality, state.codec) }
      : {}),
  })),
  setAudioBitrate: (audioBitrate) => set({ audioBitrate }),
  setVideoBitrate: (videoBitrate) => {
    const state = get();
    validateVideoBitrate(videoBitrate, state.resolution, state.fps, state.codec);
    set({ videoBitrate, videoBitrateMode: 'custom' });
  },
  setVideoBitrateMode: (mode) => {
    if (mode === 'auto') {
      const state = get();
      set({
        videoBitrateMode: 'auto',
        videoBitrate: calculateRecommendedVideoBitrate(
          state.resolution,
          state.fps,
          state.quality,
          state.codec,
        ),
      });
      return;
    }
    set({ videoBitrateMode: 'custom' });
  },
  setFormat: (format) => set({ format }),
  setIsExporting: (isExporting) => set({ isExporting }),
  setExportProgress: (exportProgress) => set({ exportProgress }),
  resetSettings: () => set({
    resolution: '1080p',
    fps: 30,
    codec: 'H.264',
    quality: 'Balanced',
    audioBitrate: '192k',
    videoBitrate: 8_000_000,
    videoBitrateMode: 'auto',
    format: 'mp4',
    isExporting: false,
    exportProgress: 0,
  }),

  addJob: (projectName, settings, projectSnapshot) => {
    const jobId = `job_${generateUUID()}`;
    const newJob: ExportJob = {
      id: jobId,
      projectName,
      status: 'waiting',
      progress: 0,
      settings: structuredClone(settings),
      projectSnapshot: structuredClone(projectSnapshot),
    };
    set((state) => ({
      jobs: [newJob, ...state.jobs],
    }));
    return jobId;
  },

  removeJob: (jobId) => {
    const existing = get().jobs.find((item) => item.id === jobId);
    if (existing?.downloadUrl) {
      URL.revokeObjectURL(existing.downloadUrl);
    }

    set((state) => ({
      jobs: state.jobs.filter((j) => j.id !== jobId),
    }));
  },

  retryJob: (jobId) => {
    const existing = get().jobs.find((item) => item.id === jobId);
    if (existing?.downloadUrl) {
      URL.revokeObjectURL(existing.downloadUrl);
    }

    set((state) => ({
      jobs: state.jobs.map((j) => {
        if (j.id === jobId) {
          return {
            ...j,
            status: 'waiting' as const,
            progress: 0,
            error: undefined,
            startTime: undefined,
            endTime: undefined,
            downloadUrl: undefined,
          };
        }
        return j;
      }),
    }));
  },

  updateJob: (jobId, updates) => {
    const existing = get().jobs.find((item) => item.id === jobId);
    if (existing?.downloadUrl &&
        Object.prototype.hasOwnProperty.call(updates, 'downloadUrl') &&
        existing.downloadUrl !== updates.downloadUrl) {
      URL.revokeObjectURL(existing.downloadUrl);
    }

    set((state) => ({
      jobs: state.jobs.map((j) => (j.id === jobId ? { ...j, ...updates } : j)),
    }));
  },

  clearQueue: () => {
    for (const job of get().jobs) {
      if (job.downloadUrl) {
        URL.revokeObjectURL(job.downloadUrl);
      }
    }
    set({ jobs: [] });
  },
}));
