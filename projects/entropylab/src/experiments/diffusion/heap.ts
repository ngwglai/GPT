/** Reusable, bounded event heap. No event objects are allocated in the solver loop. */
export class EventHeap {
  size = 0;
  readonly time: Float64Array;
  readonly i: Int32Array;
  readonly j: Int32Array;
  readonly kind: Uint8Array;
  readonly vi: Uint32Array;
  readonly vj: Uint32Array;
  outTime = 0;
  outI = 0;
  outJ = 0;
  outKind = 0;
  outVi = 0;
  outVj = 0;

  constructor(readonly capacity: number) {
    this.time = new Float64Array(capacity);
    this.i = new Int32Array(capacity);
    this.j = new Int32Array(capacity);
    this.kind = new Uint8Array(capacity);
    this.vi = new Uint32Array(capacity);
    this.vj = new Uint32Array(capacity);
  }

  private copy(to: number, from: number): void {
    this.time[to] = this.time[from];
    this.i[to] = this.i[from];
    this.j[to] = this.j[from];
    this.kind[to] = this.kind[from];
    this.vi[to] = this.vi[from];
    this.vj[to] = this.vj[from];
  }

  push(time: number, i: number, j: number, kind: number, vi: number, vj: number): boolean {
    if (this.size === this.capacity) return false;
    let k = this.size++;
    while (k > 0) {
      const parent = (k - 1) >>> 1;
      if (this.time[parent] < time || (this.time[parent] === time && this.kind[parent] <= kind))
        break;
      this.copy(k, parent);
      k = parent;
    }
    this.time[k] = time;
    this.i[k] = i;
    this.j[k] = j;
    this.kind[k] = kind;
    this.vi[k] = vi;
    this.vj[k] = vj;
    return true;
  }

  pop(): void {
    this.outTime = this.time[0];
    this.outI = this.i[0];
    this.outJ = this.j[0];
    this.outKind = this.kind[0];
    this.outVi = this.vi[0];
    this.outVj = this.vj[0];
    const end = --this.size;
    if (end === 0) return;
    const time = this.time[end],
      kind = this.kind[end];
    let k = 0;
    while (2 * k + 1 < end) {
      let child = 2 * k + 1;
      if (
        child + 1 < end &&
        (this.time[child + 1] < this.time[child] ||
          (this.time[child + 1] === this.time[child] && this.kind[child + 1] < this.kind[child]))
      )
        child++;
      if (this.time[child] > time || (this.time[child] === time && this.kind[child] >= kind)) break;
      this.copy(k, child);
      k = child;
    }
    this.copy(k, end);
  }
}
