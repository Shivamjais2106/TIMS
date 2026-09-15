'use client';

import { useEffect, useLayoutEffect, useRef } from 'react';
import { gsap } from 'gsap';

/**
 * GSAP entrance and count-up animation.
 *
 * Deliberately understated: 150-400ms, small distances. This is an intelligence
 * console, so motion shows the order in which information arrives rather than
 * entertaining.
 *
 * THE OVERRIDING RULE HERE IS THAT CONTENT MUST NEVER END UP INVISIBLE.
 *
 * An entrance animation that fails leaves a blank dashboard, which is far worse
 * than no animation at all. Three things guarantee it cannot happen:
 *
 *   1. `.tims-enter` is `opacity: 1` in CSS. Nothing is hidden by a stylesheet,
 *      so content is visible even if JavaScript never runs at all.
 *   2. Cleanup *finishes* the animation instead of killing it mid-flight. React
 *      19 strict mode mounts every effect twice in development: the first
 *      mount's tween used to be killed partway, stranding elements at opacity
 *      ~0, and the second mount skipped them because they were already marked
 *      as animated — so they stayed invisible. Exactly the "flashes once then
 *      disappears" symptom.
 *   3. `clearProps` never touches `opacity`, only `transform`.
 */

function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * useLayoutEffect on the client, useEffect on the server.
 *
 * The initial `opacity: 0` must be applied before the browser paints, or the
 * content is briefly visible and then snaps to transparent — a flicker. React
 * warns if useLayoutEffect is used during SSR, so it is swapped there.
 */
const useIsomorphicLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect;

/** Forces a set of elements to their final, visible resting state. */
function settle(targets: Element[] | NodeListOf<Element>): void {
  const list = Array.from(targets);
  if (list.length === 0) return;
  gsap.killTweensOf(list);
  gsap.set(list, { opacity: 1, y: 0, clearProps: 'transform' });
}

/**
 * Staggered fade and slide-in for a group of panels or stat cards.
 *
 * Attach the returned ref to a container; every descendant matching `selector`
 * animates in sequence. A MutationObserver picks up elements that mount later
 * — async data, loading-to-loaded swaps, pagination — so they animate in too
 * rather than being missed.
 */
export function useStaggerIn<T extends HTMLElement = HTMLDivElement>(
  selector = '.tims-enter',
  options: { y?: number; duration?: number; stagger?: number; delay?: number } = {},
) {
  const containerRef = useRef<T>(null);

  const { y, duration, stagger, delay } = options;

  useIsomorphicLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // Tracked per effect run, not per component instance. A strict-mode
    // remount therefore starts with an empty set and re-animates cleanly
    // instead of skipping elements the previous run had already claimed.
    const animated = new WeakSet<Element>();
    const tweens: gsap.core.Tween[] = [];

    const animateNew = (targets: HTMLElement[]) => {
      const fresh = targets.filter((element) => !animated.has(element));
      if (fresh.length === 0) return;
      for (const element of fresh) animated.add(element);

      if (prefersReducedMotion()) {
        settle(fresh);
        return;
      }

      tweens.push(
        gsap.fromTo(
          fresh,
          { opacity: 0, y: y ?? 8 },
          {
            opacity: 1,
            y: 0,
            duration: duration ?? 0.32,
            stagger: stagger ?? 0.045,
            delay: delay ?? 0,
            ease: 'power2.out',
            // Only `transform`. Clearing `opacity` would drop the inline value
            // and hand control back to the stylesheet.
            clearProps: 'transform',
          },
        ),
      );
    };

    animateNew(Array.from(container.querySelectorAll<HTMLElement>(selector)));

    const observer = new MutationObserver(() => {
      animateNew(Array.from(container.querySelectorAll<HTMLElement>(selector)));
    });
    observer.observe(container, { childList: true, subtree: true });

    return () => {
      observer.disconnect();

      // Jump every in-flight tween to its end rather than killing it. This is
      // the line that prevents a strict-mode remount from leaving the page
      // blank: whatever happens to the component, the DOM is left visible.
      for (const tween of tweens) tween.progress(1).kill();
      settle(container.querySelectorAll(selector));
    };
  }, [selector, y, duration, stagger, delay]);

  return containerRef;
}

/**
 * Counts a number up from zero.
 *
 * Writes `textContent` directly rather than driving React state: a 60fps
 * setState would re-render the whole card tree ~20 times per animation.
 */
export function useCountUp(
  value: number,
  options: { duration?: number; decimals?: number; delay?: number } = {},
) {
  const elementRef = useRef<HTMLSpanElement>(null);
  const previousRef = useRef(0);

  const { duration, decimals = 0, delay } = options;

  useEffect(() => {
    const element = elementRef.current;
    if (!element) return;

    const format = (n: number) =>
      decimals > 0 ? n.toFixed(decimals) : Math.round(n).toLocaleString('en-IN');

    if (prefersReducedMotion() || value === previousRef.current) {
      element.textContent = format(value);
      previousRef.current = value;
      return;
    }

    const counter = { current: previousRef.current };

    const animation = gsap.to(counter, {
      current: value,
      duration: duration ?? 0.7,
      delay: delay ?? 0,
      ease: 'power2.out',
      onUpdate: () => {
        element.textContent = format(counter.current);
      },
      onComplete: () => {
        element.textContent = format(value);
        previousRef.current = value;
      },
    });

    return () => {
      // Land on the real number rather than whatever frame the tween was on,
      // so a remount never leaves a stat card showing a partial count.
      animation.kill();
      element.textContent = format(value);
      previousRef.current = value;
    };
  }, [value, duration, decimals, delay]);

  return elementRef;
}

/**
 * Draws a horizontal bar to its target width.
 *
 * Used by the horizontal bar lists that replace pie charts throughout.
 */
export function useBarGrow(widthPercent: number, delay = 0) {
  const barRef = useRef<HTMLDivElement>(null);
  const target = `${Math.max(0, Math.min(100, widthPercent))}%`;

  useEffect(() => {
    const bar = barRef.current;
    if (!bar) return;

    if (prefersReducedMotion()) {
      bar.style.width = target;
      return;
    }

    const animation = gsap.fromTo(bar, { width: '0%' }, { width: target, duration: 0.5, delay, ease: 'power2.out' });

    return () => {
      // Settle at full width; a bar frozen at 0% reads as a zero value.
      animation.kill();
      bar.style.width = target;
    };
  }, [target, delay]);

  return barRef;
}

/** Fades a single element in. For panels that are not part of a stagger group. */
export function useFadeIn<T extends HTMLElement = HTMLDivElement>(delay = 0) {
  const elementRef = useRef<T>(null);

  useIsomorphicLayoutEffect(() => {
    const element = elementRef.current;
    if (!element) return;

    if (prefersReducedMotion()) {
      settle([element]);
      return;
    }

    const animation = gsap.fromTo(
      element,
      { opacity: 0, y: 6 },
      { opacity: 1, y: 0, duration: 0.3, delay, ease: 'power2.out', clearProps: 'transform' },
    );

    return () => {
      animation.progress(1).kill();
      settle([element]);
    };
  }, [delay]);

  return elementRef;
}
