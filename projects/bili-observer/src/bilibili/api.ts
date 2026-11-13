import { AppError } from '../errors';
import { BiliClient } from './client';
import { arr, comment, id, num, obj, str, video, type Obj } from './data';

export class BiliApi {
  constructor(private readonly client: BiliClient) {}
  private async fallback(primary: () => Promise<Obj>, secondary: () => Promise<Obj>) {
    try { return await primary(); }
    catch (error) {
      if (!(error instanceof AppError) || !['RISK_CONTROL', 'UPSTREAM_HTTP', 'BILI_API_ERROR'].includes(error.code)) throw error;
      return await secondary();
    }
  }
  private async detail(videoId: string) {
    const params: Record<string, string> = videoId.startsWith('BV') ? { bvid: videoId } : { aid: videoId.replace(/^av/i, '') };
    return this.fallback(() => this.client.get('/x/web-interface/wbi/view', params), () => this.client.get('/x/web-interface/view', params));
  }
  async search(keyword: string, page: number, pageSize: number, order: string) {
    const params = { search_type: 'video', keyword, page: String(page), page_size: String(pageSize), order };
    const data = await this.fallback(() => this.client.get('/x/web-interface/search/type', params), () => this.client.get('/x/web-interface/wbi/search/type', params, { wbi: true }));
    const items = arr(data.result).slice(0, pageSize).map(v => video(obj(v)));
    return { keyword, page, page_size: pageSize, total: num(data.numResults), total_pages: num(data.numPages), items, has_more: page < Number(data.numPages ?? page), note: '搜索结果不一定含点赞量，未提供的字段为 null；使用 get_video_info 读取详情。' };
  }
  async info(videoId: string) { return video(await this.detail(videoId)); }
  async user(mid: string) {
    const data = await this.fallback(() => this.client.get('/x/web-interface/card', { mid }), () => this.client.get('/x/space/wbi/acc/info', { mid }, { wbi: true }));
    const card = data.card ? obj(data.card) : data;
    return { mid: str(card.mid), name: str(card.name), signature: str(card.sign), avatar: str(card.face), level: num(obj(card.level_info).current_level ?? card.level), followers: num(card.fans ?? data.follower), video_count: num(data.archive_count), url: `https://space.bilibili.com/${mid}` };
  }
  async userVideos(mid: string, page: number, pageSize: number, order: string) {
    const params = { mid, pn: String(page), ps: String(pageSize), order, tid: '0', keyword: '' };
    const data = await this.fallback(() => this.client.get('/x/space/wbi/arc/search', params, { wbi: true }), () => this.client.get('/x/space/arc/search', params));
    const total = num(obj(data.page).count);
    return { mid, page, page_size: pageSize, total, has_more: total !== null ? page * pageSize < total : null, items: arr(obj(data.list).vlist).slice(0, pageSize).map(v => video(obj(v))) };
  }
  async subtitles(videoId: string, page: number, language: string | undefined, offset: number, limit: number) {
    const detail = await this.detail(videoId);
    const part = arr(detail.pages).map(obj).find(p => p.page === page);
    if (!part) throw new AppError('PAGE_NOT_FOUND', '指定视频分 P 不存在。');
    const params = { aid: str(detail.aid), cid: str(part.cid) };
    const data = await this.fallback(() => this.client.get('/x/player/wbi/v2', params, { login: true, wbi: true }), () => this.client.get('/x/player/v2', params, { login: true }));
    const info = obj(data.subtitle);
    const tracks = arr(info.subtitles).map(obj);
    const available = tracks.map(t => ({ id: id(t, 'id'), language: str(t.lan), label: str(t.lan_doc), ai: t.ai_status === 2 || str(t.lan).startsWith('ai-'), type: t.type ?? null, available: Boolean(t.subtitle_url) }));
    const base = { video_id: videoId, page, cid: str(part.cid), available_subtitles: available };
    if (!tracks.length) return { ...base, status: (info.need_login_subtitle || data.need_login_subtitle) ? 'login_required' : 'unavailable', segments: [], text: '', note: (info.need_login_subtitle || data.need_login_subtitle) ? '该字幕需要登录，请配置 Cookie。' : '接口未提供字幕；可能没有字幕，或受登录、地区和版权限制。不进行语音转写。' };
    const selected = language ? tracks.find(t => t.lan === language) : tracks.find(t => !str(t.lan).startsWith('ai-') && t.subtitle_url) ?? tracks.find(t => t.subtitle_url);
    if (!selected) throw new AppError('SUBTITLE_LANGUAGE_NOT_FOUND', '指定字幕不可用，请从 available_subtitles 选择语言。');
    if (!selected.subtitle_url) return { ...base, status: 'login_required', segments: [], text: '', note: '字幕地址不可用，请配置 Cookie 或检查权限。' };
    const payload = await this.client.subtitle(str(selected.subtitle_url));
    const body = arr(payload.body);
    const segments = body.slice(offset, offset + limit).map(s => { const x = obj(s); return { from: num(x.from), to: num(x.to), content: str(x.content) }; });
    return { ...base, status: 'available', selected_language: str(selected.lan), offset, limit, total_segments: body.length, next_offset: offset + segments.length < body.length ? offset + segments.length : null, segments, text: segments.map(s => s.content).join('\n') };
  }
  private async oid(videoId: string) { return /^\d+$/.test(videoId) ? videoId : /^av\d+$/i.test(videoId) ? videoId.slice(2) : str((await this.detail(videoId)).aid); }
  async comments(videoId: string, page: number, pageSize: number, sort: 'hot' | 'time') {
    const oid = await this.oid(videoId);
    const data = await this.client.get('/x/v2/reply', { type: '1', oid, pn: String(page), ps: String(pageSize), sort: sort === 'hot' ? '2' : '0' });
    const items = arr(data.replies).slice(0, pageSize).map(v => comment(obj(v)));
    const total = num(obj(data.page).count);
    return { video_id: videoId, oid, page, page_size: pageSize, sort, total, has_more: total !== null ? page * pageSize < total : null, items, note: '只返回该页主评论；楼中楼请调用 get_comment_replies。置顶评论不重复插入。' };
  }
  async replies(videoId: string, rootId: string, page: number, pageSize: number) {
    const oid = await this.oid(videoId);
    const data = await this.client.get('/x/v2/reply/reply', { type: '1', oid, root: rootId, pn: String(page), ps: String(pageSize) });
    const total = num(obj(data.page).count);
    return { video_id: videoId, oid, root_id: rootId, page, page_size: pageSize, sort: 'upstream_default', total, has_more: total !== null ? page * pageSize < total : null, root: data.root ? comment(obj(data.root)) : null, items: arr(data.replies).slice(0, pageSize).map(v => comment(obj(v))), note: '楼中楼接口使用 B站默认顺序，不承诺支持热度排序。' };
  }
  async write(videoId: string, message: string, rootId?: string, parentId?: string) {
    await this.client.checkLogin();
    const oid = await this.oid(videoId);
    if (rootId) {
      // Verify the root belongs to this video before sending.
      await this.client.get('/x/v2/reply/reply', { type: '1', oid, root: rootId, pn: '1', ps: '1' });
    }
    const data = await this.client.post({ type: '1', oid, message, plat: '1', ...(rootId ? { root: rootId, parent: parentId ?? rootId } : {}) });
    const reply = obj(data.reply);
    const rpid = id(data, 'rpid') || id(reply, 'rpid');
    if (!rpid || rpid === '0') throw new AppError('WRITE_OUTCOME_UNKNOWN', '接口未返回有效评论 ID；请先查看评论区确认结果，勿自动重发。');
    return { status: 'submitted', comment_id: rpid, root_id: rootId ?? '0', parent_id: parentId ?? rootId ?? '0', video_id: videoId, url: `https://www.bilibili.com/video/av${oid}#reply${rpid}`, note: '接口已接受提交；评论是否公开展示仍取决于 B站审核与风控。' };
  }
}
