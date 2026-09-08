import { useEffect } from 'react';
import { useProjectStore } from '../../store/useProjectStore';
import { getTransportClock } from '../../features/video-studio/playback/services/useTransportClock';

/**
 * Backward-compatible adapter for legacy consumers.
 * The transport clock is the single owner of elapsed playback time.
 */
export const usePlaybackEngine = (): void => {
  const isPlaying = useProjectStore((state) => state.isPlaying);
  const currentTime = useProjectStore((state) => state.currentTime);
  const totalDuration = useProjectStore((state) => state.totalDuration);
  const setCurrentTime = useProjectStore((state) => state.setCurrentTime);
  const setIsPlaying = useProjectStore((state) => state.setIsPlaying);

  useEffect(() => {
    const clock = getTransportClock();
    clock.setDuration(totalDuration);

    const unsubscribe = clock.subscribe((time) => {
      setCurrentTime(time);
      if (!clock.isPlaying && useProjectStore.getState().isPlaying) {
        setIsPlaying(false);
      }
    });

    return unsubscribe;
  }, [totalDuration, setCurrentTime, setIsPlaying]);

  useEffect(() => {
    const clock = getTransportClock();
    if (isPlaying) {
      if (!clock.isApproximatelyAt(currentTime, 0.06)) {
        clock.seek(currentTime);
      }
      clock.play();
    } else {
      clock.pause();
    }
  }, [isPlaying]);

  useEffect(() => {
    if (isPlaying) return;
    const clock = getTransportClock();
    if (!clock.isApproximatelyAt(currentTime, 0.06)) {
      clock.seek(currentTime);
    }
  }, [currentTime, isPlaying]);
};
