export interface TimelineHitTestRow {
  trackId: string;
  trackType: string;
  trackLaneRole: string;
  top: number;
  bottom: number;
}

export interface TimelineHitTestIndex {
  rows: TimelineHitTestRow[];
  workspaceRect: DOMRect;
}

export function createTimelineHitTestIndex(
  workspace: HTMLElement,
): TimelineHitTestIndex {
  const workspaceRect = workspace.getBoundingClientRect();
  const scrollTop = workspace.scrollTop;

  const rows: TimelineHitTestRow[] = [];
  workspace.querySelectorAll<HTMLElement>('[data-track-id]').forEach((row) => {
    const trackId = row.dataset.trackId;
    if (!trackId) return;

    const rect = row.getBoundingClientRect();
    rows.push({
      trackId,
      trackType: row.dataset.trackType ?? '',
      trackLaneRole: row.dataset.trackLaneRole ?? row.dataset.trackType ?? '',
      top: rect.top - workspaceRect.top + scrollTop,
      bottom: rect.bottom - workspaceRect.top + scrollTop,
    });
  });

  rows.sort((a, b) => a.top - b.top);
  return { rows, workspaceRect };
}

export function findTrackAtClientY(
  index: TimelineHitTestIndex,
  clientY: number,
  scrollTop: number,
): TimelineHitTestRow | null {
  const contentY = clientY - index.workspaceRect.top + scrollTop;
  const rows = index.rows;

  let low = 0;
  let high = rows.length - 1;

  while (low <= high) {
    const mid = (low + high) >> 1;
    const row = rows[mid];
    if (!row) {
      high = mid - 1;
      continue;
    }

    if (contentY < row.top) {
      high = mid - 1;
    } else if (contentY > row.bottom) {
      low = mid + 1;
    } else {
      return row;
    }
  }

  return null;
}
