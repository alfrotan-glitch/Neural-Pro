import React from 'react';
import { timeToPixel, TIMELINE_HEADER_WIDTH } from '../geometry';

export interface TimelineRulerProps {
  timelineRef: React.RefObject<HTMLDivElement | null>;
  timelineWidth: number;
  totalDuration: number;
  basePixelsPerSecond: number;
  timelineZoom: number;
  visibleTimeRange: { start: number; end: number };
  markIn: number | null;
  markOut: number | null;
  handleTimelineMouseDown: (event: React.MouseEvent) => void;
}

export const TimelineRuler: React.FC<TimelineRulerProps> = ({
  timelineRef, timelineWidth, totalDuration, basePixelsPerSecond, timelineZoom, visibleTimeRange, markIn, markOut, handleTimelineMouseDown,
}) => (
  <>
          {/* Time Ruler Header */}
          <div className="h-7 border-b border-white/5 bg-[#0e1015] relative shrink-0 select-none flex items-stretch w-full sticky top-0 z-30">
            <div
              style={{ width: `${TIMELINE_HEADER_WIDTH}px`, minWidth: `${TIMELINE_HEADER_WIDTH}px`, maxWidth: `${TIMELINE_HEADER_WIDTH}px` }}
              className="shrink-0 bg-[#0c0d12] border-r border-white/5 sticky left-0 z-40 flex items-center justify-center border-b border-white/5"
            >
              <span className="text-[8px] tracking-widest uppercase text-gray-500 font-extrabold font-mono">Timecode</span>
            </div>

            <div 
              ref={timelineRef}
              onMouseDown={handleTimelineMouseDown}
              style={{ width: `${timelineWidth}px` }}
              className="relative h-full bg-[#0e1015] shrink-0 cursor-ew-resize overflow-hidden"
            >
              {/* In and Out range band overlay */}
              {markIn !== null && markOut !== null && markOut > markIn && (
                <div 
                  style={{
                    left: `${timeToPixel(markIn, basePixelsPerSecond * timelineZoom)}px`,
                    width: `${timeToPixel(markOut - markIn, basePixelsPerSecond * timelineZoom)}px`
                  }}
                  className="absolute top-0 bottom-0 bg-purple-500/10 pointer-events-none border-x border-purple-400/30"
                />
              )}

              {/* In point flag indicator */}
              {markIn !== null && (
                <div 
                  style={{ left: `${timeToPixel(markIn, basePixelsPerSecond * timelineZoom)}px` }}
                  className="absolute top-0 w-3 h-full pointer-events-none z-10"
                  title={`In: ${markIn.toFixed(1)}s`}
                >
                  <div className="border-l-2 border-cyan-400 h-full absolute left-0" />
                  <div className="bg-cyan-400 text-[7px] font-mono font-bold text-black px-1 py-0.5 rounded-br absolute left-0 top-0 leading-none shadow-sm">IN</div>
                </div>
              )}

              {/* Out point flag indicator */}
              {markOut !== null && (
                <div 
                  style={{ left: `${timeToPixel(markOut, basePixelsPerSecond * timelineZoom)}px` }}
                  className="absolute top-0 w-3 h-full pointer-events-none -translate-x-full z-10"
                  title={`Out: ${markOut.toFixed(1)}s`}
                >
                  <div className="border-r-2 border-amber-400 h-full absolute right-0" />
                  <div className="bg-amber-400 text-[7px] font-mono font-bold text-black px-1 py-0.5 rounded-bl absolute right-0 top-0 leading-none shadow-sm">OUT</div>
                </div>
              )}

              {(() => {
                // Determine tick intervals based on horizontal pixels per second for extremely flexible & precise layout
                const pixelsPerSecond = basePixelsPerSecond * timelineZoom;
                
                const standardIntervals = [
                  { tick: 0.05, major: 0.1 },   // 0.05s, 0.1s
                  { tick: 0.1, major: 0.5 },    // 0.1s, 0.5s
                  { tick: 0.2, major: 1.0 },    // 0.2s, 1s
                  { tick: 0.5, major: 2.0 },    // 0.5s, 2s
                  { tick: 1.0, major: 5.0 },    // 1s, 5s
                  { tick: 2.0, major: 10.0 },   // 2s, 10s
                  { tick: 5.0, major: 30.0 },   // 5s, 30s
                  { tick: 10.0, major: 60.0 },  // 10s, 1m
                  { tick: 30.0, major: 120.0 }, // 30s, 2m
                  { tick: 60.0, major: 300.0 }, // 1m, 5m
                  { tick: 120.0, major: 600.0 }, // 2m, 10m
                  { tick: 300.0, major: 1800.0 }, // 5m, 30m
                  { tick: 600.0, major: 3600.0 }, // 10m, 1h
                  { tick: 1800.0, major: 7200.0 }, // 30m, 2h
                  { tick: 3600.0, major: 18000.0 }, // 1h, 5h
                ];

                let chosenInterval = standardIntervals[standardIntervals.length - 1] ?? standardIntervals[0];
                if (!chosenInterval) return null;
                for (const pair of standardIntervals) {
                  if (pair.major * pixelsPerSecond >= 75 && pair.tick * pixelsPerSecond >= 12) {
                    chosenInterval = pair;
                    break;
                  }
                }
                const tickInterval = chosenInterval.tick;
                const majorTickInterval = chosenInterval.major;

                const ticks = [];
                const startTick = Math.max(0, Math.floor(visibleTimeRange.start / tickInterval) * tickInterval);
                const endTick = Math.min(visibleTimeRange.end, Math.ceil(visibleTimeRange.end / tickInterval) * tickInterval);
                
                const formatTickLabel = (timeVal: number) => {
                  if (timeVal >= 3600) {
                    const hrs = Math.floor(timeVal / 3600);
                    const mins = Math.floor((timeVal % 3600) / 60);
                    const secs = Math.floor(timeVal % 60);
                    return `${hrs}h ${mins}m ${secs}s`;
                  }
                  return timeVal >= 60 ? `${Math.floor(timeVal/60)}m ${Math.floor(timeVal%60)}s` : `${timeVal}s`;
                };

                // Limit max iterations to prevent browser freezing under weird circumstances
                let count = 0;
                for (let time = startTick; time <= endTick && count < 500; time += tickInterval) {
                  count++;
                  const isAlmostMajor = Math.abs((time / majorTickInterval) - Math.round(time / majorTickInterval)) < 0.0001;
                  
                  ticks.push(
                    <div 
                      key={time} 
                      style={{ left: `${timeToPixel(time, basePixelsPerSecond * timelineZoom)}px` }}
                      className="absolute top-0 bottom-0 flex flex-col justify-between"
                    >
                      <div className={`border-l border-white/20 ${isAlmostMajor ? 'h-3' : 'h-1.5'}`} />
                      {isAlmostMajor && (
                        <span className="text-[7px] font-mono font-extrabold text-gray-500 -translate-x-1/2 mb-0.5 select-none pointer-events-none">
                          {formatTickLabel(time)}
                        </span>
                      )}
                    </div>
                  );
                }
                return ticks;
              })()}
            </div>
          </div>


  </>
);
