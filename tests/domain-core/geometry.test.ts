import { check, equal, suite, throws } from './harness';
import {
  DEFAULT_FIT_MODE,
  MEDIA_FRAME_SIZE_FRACTION,
  MEDIA_FRAME_SIZE_PERCENT,
  aspectRatio,
  centerRect,
  fitRect,
  isFiniteSize,
  mediaFrameGeometry,
  transformOrigin,
} from '../../src/domain/core/geometry';
import { assertSize } from '../../src/domain/core/geometry';

export default suite('geometry — composition frame and fit', () => {
  // ---- media frame (port of the executing 85 % contract) -----------------
  equal(MEDIA_FRAME_SIZE_PERCENT, 85, 'the media frame is 85 % of the canvas');
  equal(MEDIA_FRAME_SIZE_FRACTION, 0.85, 'the fraction matches the percent');

  const frame = mediaFrameGeometry({ width: 1920, height: 1080 });
  equal(frame.width, 1632, 'frame width is 85 % of 1920');
  equal(frame.height, 918, 'frame height is 85 % of 1080');
  equal(frame.x, 144, 'frame is horizontally centred');
  equal(frame.y, 81, 'frame is vertically centred');

  const degenerate = mediaFrameGeometry({ width: Number.NaN, height: 100 });
  equal(degenerate.width, 0, 'a non-finite canvas yields a zero frame, never NaN');
  equal(degenerate.height, 0, 'a non-finite canvas yields a zero frame height');
  equal(mediaFrameGeometry({ width: -10, height: 10 }).width, 0, 'a negative canvas yields a zero frame');

  // ---- fit ---------------------------------------------------------------
  const box = { x: 0, y: 0, width: 200, height: 100 };
  const square = { width: 100, height: 100 };

  const cover = fitRect(square, box, 'cover');
  equal(cover.width, 200, 'cover scales by the max factor (200/100)');
  equal(cover.height, 200, 'cover scales both axes by the same factor');
  equal(cover.x, 0, 'cover is centred horizontally');
  equal(cover.y, -50, 'cover overflows the box vertically — it is meant to be clipped');
  equal(DEFAULT_FIT_MODE, 'cover', 'cover is the executing default in Neural-Pro');

  const contain = fitRect(square, box, 'contain');
  equal(contain.width, 100, 'contain scales by the min factor (100/100)');
  equal(contain.height, 100, 'contain preserves the aspect ratio');
  equal(contain.x, 50, 'contain is centred horizontally');
  equal(contain.y, 0, 'contain fits vertically without overflow');

  const fill = fitRect(square, box, 'fill');
  equal(fill.width, 200, 'fill stretches to the full box width');
  equal(fill.height, 100, 'fill stretches to the full box height');

  const none = fitRect(square, box, 'none');
  equal(none.width, 100, 'none keeps the natural width');
  equal(none.x, 50, 'none is centred');

  const zeroSource = fitRect({ width: 0, height: 0 }, box, 'cover');
  equal(zeroSource.width, 0, 'a zero-sized source yields a zero rect, never Infinity');
  equal(zeroSource.height, 0, 'a zero-sized source yields a zero height');
  const zeroFrame = fitRect(square, { x: 0, y: 0, width: 0, height: 0 }, 'cover');
  equal(zeroFrame.width, 0, 'a zero-sized frame yields a zero rect, never NaN');

  const nanFrame = fitRect(square, { x: 0, y: 0, width: Number.NaN, height: 100 }, 'cover');
  equal(nanFrame.width, 0, 'a non-finite frame yields a zero rect so no draw call can be non-finite');

  // ---- helpers -----------------------------------------------------------
  equal(transformOrigin({ width: 1920, height: 1080 }).x, 960, 'the origin is the centre');
  const centred = centerRect({ x: 10, y: 10, width: 100, height: 100 }, { width: 20, height: 40 });
  equal(centred.x, 50, 'centerRect centres horizontally');
  equal(centred.y, 40, 'centerRect centres vertically');

  equal(aspectRatio({ width: 1920, height: 1080 }), 16 / 9, 'aspect ratio is width / height');
  equal(aspectRatio({ width: 1920, height: 0 }), 0, 'a zero height yields 0, not Infinity');

  check(isFiniteSize({ width: 1, height: 1 }) && !isFiniteSize({ width: -1, height: 1 }), 'isFiniteSize discriminates');
  throws(() => assertSize({ width: -1, height: 100 }), 'assertSize rejects a negative size');
  throws(() => assertSize({ width: Number.NaN, height: 100 }), 'assertSize rejects NaN');
});
