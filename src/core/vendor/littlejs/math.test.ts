import { describe, expect, it } from 'vitest';
import { clamp, collideCircleBox, collideCircleCircle, lerp, Vector2, vec2 } from './math';

describe('clamp / lerp', () => {
  it('clamps to [0, 1] by default', () => {
    expect(clamp(-1)).toBe(0);
    expect(clamp(0.5)).toBe(0.5);
    expect(clamp(2)).toBe(1);
  });

  it('clamps to a custom range', () => {
    expect(clamp(15, 0, 10)).toBe(10);
  });

  it('lerps with a clamped percent', () => {
    expect(lerp(10, 20, 0.25)).toBe(12.5);
    expect(lerp(10, 20, 2)).toBe(20);
  });
});

describe('Vector2', () => {
  it('vec2(n) fills both axes', () => {
    expect(vec2(5)).toEqual(new Vector2(5, 5));
    expect(vec2()).toEqual(new Vector2(0, 0));
  });

  it('arithmetic returns new vectors', () => {
    const a = vec2(1, 2);
    const b = a.add(vec2(3, 4));
    expect(b).toEqual(vec2(4, 6));
    expect(a).toEqual(vec2(1, 2));
    expect(b.subtract(a)).toEqual(vec2(3, 4));
    expect(a.scale(2)).toEqual(vec2(2, 4));
  });

  it('length, dot, cross', () => {
    expect(vec2(3, 4).length()).toBe(5);
    expect(vec2(3, 4).lengthSquared()).toBe(25);
    expect(vec2(1, 2).dot(vec2(3, 4))).toBe(11);
    expect(vec2(1, 0).cross(vec2(0, 1))).toBe(1);
  });

  it('normalize keeps direction, and a zero vector normalizes to straight up', () => {
    const n = vec2(3, 4).normalize();
    expect(n.x).toBeCloseTo(0.6);
    expect(n.y).toBeCloseTo(0.8);
    expect(vec2().normalize(2)).toEqual(vec2(0, 2));
  });

  it('reflect bounces off a surface, scaled by restitution', () => {
    const v = vec2(1, -1); // moving down-right
    const up = vec2(0, 1); // floor normal
    expect(v.reflect(up)).toEqual(vec2(1, 1));
    const damped = v.reflect(up, 0.5);
    expect(damped.x).toBeCloseTo(1);
    expect(damped.y).toBeCloseTo(0.5);
  });
});

describe('collideCircleCircle', () => {
  it('returns undefined when circles do not touch', () => {
    expect(collideCircleCircle(vec2(0, 0), 1, vec2(3, 0), 1)).toBeUndefined();
  });

  it('returns the push-out vector for A when they overlap', () => {
    const push = collideCircleCircle(vec2(1.5, 0), 1, vec2(0, 0), 1);
    expect(push?.x).toBeCloseTo(0.5);
    expect(push?.y).toBeCloseTo(0);
  });

  it('pushes coincident centers straight up', () => {
    const push = collideCircleCircle(vec2(0, 0), 1, vec2(0, 0), 1);
    expect(push).toEqual(vec2(0, 2));
  });
});

describe('collideCircleBox', () => {
  const boxPos = vec2(0, 0);
  const boxSize = vec2(2, 2); // spans -1..1

  it('returns undefined when the circle is clear of the box', () => {
    expect(collideCircleBox(vec2(3, 0), 1, boxPos, boxSize)).toBeUndefined();
  });

  it('pushes out from the nearest face when overlapping the edge', () => {
    const push = collideCircleBox(vec2(1.5, 0), 1, boxPos, boxSize);
    expect(push?.x).toBeCloseTo(0.5);
    expect(push?.y).toBeCloseTo(0);
  });

  it('pushes out along the axis of least penetration when the center is inside', () => {
    const push = collideCircleBox(vec2(0.8, 0), 0.5, boxPos, boxSize);
    expect(push?.x).toBeCloseTo(0.7);
    expect(push?.y).toBe(0);
  });
});
