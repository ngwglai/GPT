export class AppError extends Error {
  constructor(public readonly code: string, message: string, public readonly upstreamCode?: number) {
    super(message);
  }
}

export function apiError(code: number): AppError {
  if (code === -101) return new AppError('LOGIN_EXPIRED', 'B站登录失效，请更新 SESSDATA。', code);
  if (code === -102) return new AppError('ACCOUNT_RESTRICTED', '账号被限制，无法执行此操作。', code);
  if (code === -111 || code === -1111 || code === -403) return new AppError('CSRF_OR_ACCESS_DENIED', 'CSRF 校验或访问权限失败，请检查 bili_jct 与登录会话。', code);
  if ([-352, -412, -509, 12002].includes(code)) return new AppError('RISK_CONTROL', 'B站限制了此请求；请降低频率，稍后重试或检查登录与网络。', code);
  if (code === -404 || code === 62002) return new AppError('NOT_FOUND', '目标不存在或已不可访问。', code);
  if (code === 12015 || code === 12016) return new AppError('COMMENTS_DISABLED', '目标评论区不可发布评论。', code);
  return new AppError('BILI_API_ERROR', 'B站接口拒绝请求；请根据 upstream_code 检查限制。', code);
}

export function publicError(error: unknown) {
  if (error instanceof AppError) return { code: error.code, message: error.message, ...(error.upstreamCode !== undefined ? { upstream_code: error.upstreamCode } : {}) };
  return { code: 'INTERNAL_ERROR', message: '服务处理失败；请稍后重试。' };
}
