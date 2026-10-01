/*
 * Vendored from LittleJS v1.22.0, src/engineMath.js
 * https://github.com/KilledByAPixel/LittleJS
 *
 * The MIT License
 *
 * Copyright (c) 2021 Frank Force http://www.frankforce.com
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in
 * all copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
 * THE SOFTWARE.
 *
 * Modifications: converted to TypeScript, trimmed to the subset plinko-config
 * uses, debug asserts removed. Behaviour is otherwise unchanged.
 * See ./README.md for the list of vendored symbols.
 */

/** Clamps the value between min and max. */
export function clamp(value: number, min = 0, max = 1): number {
  return value < min ? min : value > max ? max : value;
}

/** Linearly interpolates between values passed in using percent, percent is clamped to 0-1. */
export function lerp(valueA: number, valueB: number, percent: number): number {
  return valueA + clamp(percent) * (valueB - valueA);
}

/**
 * 2D Vector object with vector math library.
 * Most functions return a new vector so they can be chained; the set functions change this one.
 */
export class Vector2 {
  constructor(
    public x = 0,
    public y = 0,
  ) {}

  /** Sets values of this vector and returns self. */
  set(x = 0, y = 0): this {
    this.x = x;
    this.y = y;
    return this;
  }

  /** Sets this vector from another vector and returns self. */
  setFrom(v: Vector2): this {
    return this.set(v.x, v.y);
  }

  /** Returns a new vector that is a copy of this. */
  copy(): Vector2 {
    return new Vector2(this.x, this.y);
  }

  /** Returns a copy of this vector plus the vector passed in. */
  add(v: Vector2): Vector2 {
    return new Vector2(this.x + v.x, this.y + v.y);
  }

  /** Returns a copy of this vector minus the vector passed in. */
  subtract(v: Vector2): Vector2 {
    return new Vector2(this.x - v.x, this.y - v.y);
  }

  /** Returns a copy of this vector scaled by the number passed in. */
  scale(s: number): Vector2 {
    return new Vector2(this.x * s, this.y * s);
  }

  /** Returns the length of this vector. */
  length(): number {
    return this.lengthSquared() ** 0.5;
  }

  /** Returns the length of this vector squared. */
  lengthSquared(): number {
    return this.x ** 2 + this.y ** 2;
  }

  /** Returns the distance from this vector to vector passed in. */
  distance(v: Vector2): number {
    return this.distanceSquared(v) ** 0.5;
  }

  /** Returns the distance squared from this vector to vector passed in. */
  distanceSquared(v: Vector2): number {
    return (this.x - v.x) ** 2 + (this.y - v.y) ** 2;
  }

  /**
   * Returns a new vector in same direction as this one with the length passed in.
   * A zero vector has no direction, so it normalizes to straight up.
   */
  normalize(length = 1): Vector2 {
    const l = this.length();
    return l ? this.scale(length / l) : new Vector2(0, length);
  }

  /** Returns a new vector clamped to length passed in. */
  clampLength(length = 1): Vector2 {
    const l = this.length();
    return l > length ? this.scale(length / l) : this.copy();
  }

  /** Returns the dot product of this and the vector passed in. */
  dot(v: Vector2): number {
    return this.x * v.x + this.y * v.y;
  }

  /** Returns the cross product of this and the vector passed in. */
  cross(v: Vector2): number {
    return this.x * v.y - this.y * v.x;
  }

  /** Returns a copy of this vector reflected by the surface normal. */
  reflect(normal: Vector2, restitution = 1): Vector2 {
    return this.subtract(normal.scale((1 + restitution) * this.dot(normal)));
  }

  /** Returns a new vector that is p percent between this and the vector passed in, percent is clamped to 0-1. */
  lerp(v: Vector2, percent: number): Vector2 {
    const p = clamp(percent);
    return new Vector2(v.x * p + this.x * (1 - p), v.y * p + this.y * (1 - p));
  }
}

/** Create a 2D vector; `vec2(5)` gives (5, 5). */
export function vec2(x = 0, y?: number): Vector2 {
  return new Vector2(x, y ?? x);
}

/** Returns the vector to move circle A by so it no longer overlaps circle B, or undefined. */
export function collideCircleCircle(
  posA: Vector2,
  radiusA: number,
  posB: Vector2,
  radiusB: number,
): Vector2 | undefined {
  const d = posA.subtract(posB);
  const r = radiusA + radiusB;
  const dist = d.length();
  if (dist >= r) return undefined;
  return d.normalize(r - dist); // coincident centers normalize to straight up
}

/**
 * Returns the vector to move a circle out of an axis aligned box, or undefined.
 * The box is centered on boxPos with full size boxSize.
 */
export function collideCircleBox(
  pos: Vector2,
  radius: number,
  boxPos: Vector2,
  boxSize: Vector2,
): Vector2 | undefined {
  const h = boxSize.scale(0.5);
  const closest = vec2(
    clamp(pos.x, boxPos.x - h.x, boxPos.x + h.x),
    clamp(pos.y, boxPos.y - h.y, boxPos.y + h.y),
  );
  const d = pos.subtract(closest);
  const distSq = d.lengthSquared();
  if (distSq) return distSq >= radius * radius ? undefined : d.normalize(radius - distSq ** 0.5);

  // center is inside the box, push out along the axis of least penetration
  const offset = pos.subtract(boxPos);
  return pushOutAxis(offset, h.x - Math.abs(offset.x), h.y - Math.abs(offset.y), radius);
}

function pushOutAxis(d: Vector2, penX: number, penY: number, extra = 0): Vector2 {
  const s = (v: number) => (v >= 0 ? 1 : -1); // sign() gives 0 on a tie, which would be no push
  return penX <= penY ? vec2(s(d.x) * (penX + extra), 0) : vec2(0, s(d.y) * (penY + extra));
}
