// Only selected public fields are returned; upstream payloads/cookies are never forwarded.
export type Obj = Record<string, unknown>;
export const obj = (v: unknown): Obj => v !== null && typeof v === 'object' && !Array.isArray(v) ? v as Obj : {};
export const arr = (v: unknown): unknown[] => Array.isArray(v) ? v : [];
export const str = (v: unknown): string => typeof v === 'string' ? v : typeof v === 'number' ? String(v) : '';
export const num = (v: unknown): number | null => typeof v === 'number' && Number.isFinite(v) ? v : null;
export const id = (v: Obj, key: string): string => str(v[`${key}_str`] ?? v[key]);
export const iso = (v: unknown): string | null => typeof v === 'number' && v > 0 && v < 1e11 ? new Date(v * 1000).toISOString() : null;
export const plain = (v: unknown): string => str(v).replace(/<[^>]*>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'");
export function video(v: Obj) {
  const owner = obj(v.owner), stats = obj(v.stat);
  return {
    bvid: str(v.bvid), aid: str(v.aid ?? v.id), title: plain(v.title),
    url: `https://www.bilibili.com/video/${str(v.bvid) || `av${str(v.aid ?? v.id)}`}`,
    author: str(owner.name ?? v.author), author_id: str(owner.mid ?? v.mid),
    published_at: iso(v.pubdate ?? v.created), published_timestamp: num(v.pubdate ?? v.created),
    views: stats.view ?? v.play ?? null, likes: stats.like ?? v.like ?? null,
    description: str(v.desc ?? v.description), duration: v.duration ?? v.length ?? null,
    comment_count: stats.reply ?? v.video_review ?? null,
    pages: arr(v.pages).map(p => { const x = obj(p); return { page: num(x.page), cid: str(x.cid), title: str(x.part), duration: num(x.duration) }; })
  };
}
export function comment(v: Obj) {
  const member = obj(v.member);
  return {
    comment_id: id(v, 'rpid'), root_id: id(v, 'root') || '0', parent_id: id(v, 'parent') || '0',
    content: str(obj(v.content).message), user_name: str(member.uname), user_id: str(member.mid),
    created_at: iso(v.ctime), created_timestamp: num(v.ctime), likes: num(v.like),
    reply_count: num(v.rcount ?? v.count)
  };
}
