import { useCallback, useEffect, useRef, useState, type RefObject } from "react";

// Zoom and pan for the org chart's canvas. Zoom is CSS `zoom` on the stage (a
// custom property the stylesheet reads), not a transform, so the canvas's
// scroll extent always matches what is drawn and "Fit" leaves no sideways
// scroll. One pointer drags the canvas, two pinch; a drag never fires the click
// on the card under it. Ctrl or ⌘ with the wheel zooms around the pointer.

const MIN = 0.25;
const MAX = 1.5;
const clamp = (z: number) => Math.max(MIN, Math.min(MAX, Math.round(z * 100) / 100));

export function useZoomPan(
  canvasRef: RefObject<HTMLDivElement | null>,
  stageRef: RefObject<HTMLDivElement | null>,
  innerRef: RefObject<HTMLDivElement | null>,
  /** Width the side panel covers, so centring aims at the part of the canvas still visible. */
  coveredRight: number,
) {
  const [zoom, setZoomState] = useState(1);
  const zoomRef = useRef(1);
  const coveredRef = useRef(coveredRight);
  useEffect(() => {
    coveredRef.current = coveredRight;
  }, [coveredRight]);

  const apply = useCallback(
    (z: number) => {
      zoomRef.current = z;
      stageRef.current?.style.setProperty("--admin-org-zoom", String(z));
      setZoomState(z);
    },
    [stageRef],
  );

  /** Zoom to `next`, keeping the point at (fx, fy) in the canvas where it is. */
  const setZoom = useCallback(
    (next: number, fx?: number, fy?: number) => {
      const canvas = canvasRef.current;
      const stage = stageRef.current;
      if (!canvas || !stage) return;
      const z = clamp(next);
      const px = fx ?? (canvas.clientWidth - coveredRef.current) / 2;
      const py = fy ?? canvas.clientHeight / 2;
      const prev = zoomRef.current;
      const cx = (canvas.scrollLeft + px - stage.offsetLeft) / prev;
      const cy = (canvas.scrollTop + py) / prev;
      apply(z);
      canvas.scrollLeft = stage.offsetLeft + cx * z - px;
      canvas.scrollTop = cy * z - py;
    },
    [apply, canvasRef, stageRef],
  );

  // Fit the width; a tall tree then pans vertically, which keeps cards readable.
  const fit = useCallback(() => {
    const canvas = canvasRef.current;
    const inner = innerRef.current;
    if (!canvas || !inner || !inner.offsetWidth) return;
    apply(Math.max(MIN, Math.floor(Math.min(1, canvas.clientWidth / inner.offsetWidth) * 100) / 100));
    canvas.scrollLeft = 0;
    canvas.scrollTop = 0;
  }, [apply, canvasRef, innerRef]);

  /** Scroll so `el` sits in the middle of the visible canvas, zooming up to `minZoom` first. */
  const centerOn = useCallback(
    (el: HTMLElement | null, minZoom?: number) => {
      const canvas = canvasRef.current;
      const stage = stageRef.current;
      const inner = innerRef.current;
      if (!el || !canvas || !stage || !inner) return;
      if (minZoom && zoomRef.current < minZoom) setZoom(minZoom);
      let x = 0;
      let y = 0;
      let n: HTMLElement | null = el;
      while (n && n !== inner) {
        x += n.offsetLeft;
        y += n.offsetTop;
        n = n.offsetParent as HTMLElement | null;
      }
      const z = zoomRef.current;
      const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      canvas.scrollTo({
        left: stage.offsetLeft + (x + el.offsetWidth / 2) * z - (canvas.clientWidth - coveredRef.current) / 2,
        top: (y + el.offsetHeight / 2) * z - canvas.clientHeight / 2,
        behavior: reduce ? "auto" : "smooth",
      });
    },
    [canvasRef, innerRef, setZoom, stageRef],
  );

  // Native listeners: the wheel must be non-passive to stop the page zooming,
  // and pointer capture is set on the canvas itself.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ptrs = new Map<number, { x: number; y: number }>();
    let drag: { x: number; y: number; sl: number; st: number; moved: boolean; id: number } | null = null;
    let pinch: { d: number; z: number } | null = null;
    let suppress = false;

    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      const r = canvas.getBoundingClientRect();
      setZoom(zoomRef.current * (e.deltaY < 0 ? 1.1 : 1 / 1.1), e.clientX - r.left, e.clientY - r.top);
    };
    const onDown = (e: PointerEvent) => {
      ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (ptrs.size === 1) drag = { x: e.clientX, y: e.clientY, sl: canvas.scrollLeft, st: canvas.scrollTop, moved: false, id: e.pointerId };
      if (ptrs.size === 2) {
        const [a, b] = [...ptrs.values()];
        pinch = { d: Math.hypot(a.x - b.x, a.y - b.y) || 1, z: zoomRef.current };
        drag = null;
      }
    };
    const onMove = (e: PointerEvent) => {
      if (!ptrs.has(e.pointerId)) return;
      ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pinch && ptrs.size === 2) {
        const [p1, p2] = [...ptrs.values()];
        const r = canvas.getBoundingClientRect();
        setZoom((pinch.z * Math.hypot(p1.x - p2.x, p1.y - p2.y)) / pinch.d, (p1.x + p2.x) / 2 - r.left, (p1.y + p2.y) / 2 - r.top);
        suppress = true;
        return;
      }
      if (!drag || drag.id !== e.pointerId) return;
      const dx = e.clientX - drag.x;
      const dy = e.clientY - drag.y;
      if (!drag.moved && Math.hypot(dx, dy) < 5) return;
      if (!drag.moved) {
        drag.moved = true;
        canvas.classList.add("is-panning");
        canvas.setPointerCapture(e.pointerId);
      }
      canvas.scrollLeft = drag.sl - dx;
      canvas.scrollTop = drag.st - dy;
    };
    const onUp = (e: PointerEvent) => {
      ptrs.delete(e.pointerId);
      if (drag?.moved) suppress = true;
      if (ptrs.size < 2) pinch = null;
      if (!ptrs.size) {
        drag = null;
        canvas.classList.remove("is-panning");
      }
    };
    const onClickCapture = (e: MouseEvent) => {
      if (!suppress) return;
      e.stopPropagation();
      e.preventDefault();
      suppress = false;
    };

    canvas.addEventListener("wheel", onWheel, { passive: false });
    canvas.addEventListener("pointerdown", onDown);
    canvas.addEventListener("pointermove", onMove);
    canvas.addEventListener("pointerup", onUp);
    canvas.addEventListener("pointercancel", onUp);
    canvas.addEventListener("click", onClickCapture, true);
    return () => {
      canvas.removeEventListener("wheel", onWheel);
      canvas.removeEventListener("pointerdown", onDown);
      canvas.removeEventListener("pointermove", onMove);
      canvas.removeEventListener("pointerup", onUp);
      canvas.removeEventListener("pointercancel", onUp);
      canvas.removeEventListener("click", onClickCapture, true);
    };
  }, [canvasRef, setZoom]);

  // Open fitted to the screen, and fit again once the web font has loaded,
  // since the card widths it measures change with the font.
  useEffect(() => {
    fit();
    let live = true;
    void document.fonts?.ready.then(() => {
      if (live) fit();
    });
    return () => {
      live = false;
    };
  }, [fit]);

  return { zoom, setZoom, fit, centerOn };
}
