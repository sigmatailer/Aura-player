import { useRef, useEffect } from 'react';

/**
 * Custom hook for smooth horizontal scrolling:
 * 1. Translates vertical mouse wheel (deltaY) into horizontal scroll (scrollLeft).
 * 2. Prevents parent/drawer from scrolling vertically when cursor is over this container.
 * 3. Supports smooth click-and-drag mouse scrolling.
 */
export function useHorizontalScroll<T extends HTMLElement = HTMLDivElement>() {
  const elRef = useRef<T>(null);

  useEffect(() => {
    const el = elRef.current;
    if (!el) return;

    // Convert vertical mouse wheel into horizontal scroll and prevent parent scroll
    const onWheel = (e: WheelEvent) => {
      const delta = Math.abs(e.deltaY) >= Math.abs(e.deltaX) ? e.deltaY : e.deltaX;
      if (delta !== 0) {
        // Prevent parent from scrolling vertically
        e.preventDefault();
        e.stopPropagation();
        el.scrollLeft += delta * 0.9;
      }
    };

    // Drag-to-scroll support with mouse
    let isDown = false;
    let startX = 0;
    let startScrollLeft = 0;
    let draggedDistance = 0;

    const onMouseDown = (e: MouseEvent) => {
      if (e.button !== 0) return;
      isDown = true;
      draggedDistance = 0;
      startX = e.pageX - el.offsetLeft;
      startScrollLeft = el.scrollLeft;
    };

    const onMouseMove = (e: MouseEvent) => {
      if (!isDown) return;
      const x = e.pageX - el.offsetLeft;
      const walk = x - startX;
      draggedDistance = Math.abs(walk);
      el.scrollLeft = startScrollLeft - walk;
    };

    const onMouseUp = () => {
      isDown = false;
    };

    const onMouseLeave = () => {
      isDown = false;
    };

    // Prevent accidental button click if user was dragging
    const onClickCapture = (e: MouseEvent) => {
      if (draggedDistance > 6) {
        e.stopPropagation();
        e.preventDefault();
      }
    };

    el.addEventListener('wheel', onWheel, { passive: false });
    el.addEventListener('mousedown', onMouseDown);
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    el.addEventListener('mouseleave', onMouseLeave);
    el.addEventListener('click', onClickCapture, true);

    return () => {
      el.removeEventListener('wheel', onWheel);
      el.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
      el.removeEventListener('mouseleave', onMouseLeave);
      el.removeEventListener('click', onClickCapture, true);
    };
  }, []);

  return elRef;
}
