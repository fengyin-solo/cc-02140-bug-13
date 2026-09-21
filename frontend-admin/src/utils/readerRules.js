// ========================================
// 读者卡号 / 有效期 / 借阅关联的统一业务规则
// 新增读者、编辑资料、借阅入口共用本模块，避免各页面判定不一致
// ========================================

// 本地日期格式化为 YYYY-MM-DD（不能使用 toISOString，UTC 偏移会导致边界日期翻转）
export function formatDate(date) {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

// 今天的日期字符串（本地时区）
export function todayStr() {
  return formatDate(new Date())
}

// 在 YYYY-MM-DD 日期上增减天数（按本地日期计算，无 UTC 偏移问题）
export function addDays(dateStr, days) {
  const [y, m, d] = String(dateStr).split('-').map(Number)
  const date = new Date(y, m - 1, d)
  date.setDate(date.getDate() + days)
  return formatDate(date)
}

/**
 * 有效期判定：到期日当天仍视为有效（边界日期不回退）。
 * expireDate 为 YYYY-MM-DD 字符串，与今天按字符串比较即可，
 * 同格式字符串比较与日期先后顺序一致，且不受时区影响。
 */
export function isReaderActive(reader, today = todayStr()) {
  return Boolean(reader?.expireDate) && reader.expireDate >= today
}

// 统一的读者状态计算：所有页面（档案、列表、筛选、详情、借阅入口）均以此为准
export function getReaderStatus(reader, today = todayStr()) {
  return isReaderActive(reader, today) ? 'active' : 'expired'
}

/**
 * 卡号唯一规则（新增 / 编辑 / 借阅入口共用）。
 * @param {Array} readers 读者档案列表
 * @param {string} cardNo 待校验卡号
 * @param {number|null} excludeId 编辑时排除自身 id
 */
export function isCardNoUnique(readers, cardNo, excludeId = null) {
  const normalized = String(cardNo || '').trim().toUpperCase()
  if (!normalized) return false
  return !readers.some(reader =>
    String(reader.cardNo).trim().toUpperCase() === normalized && reader.id !== excludeId
  )
}

// 读者当前未归还（借阅中 / 已逾期）的借阅数，作为借阅情况的唯一真值
export function getActiveBorrowCount(records, readerId) {
  return records.filter(record =>
    record.readerId === readerId && record.status !== 'returned'
  ).length
}
