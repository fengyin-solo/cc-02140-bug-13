// ========================================
// 读者 / 借阅共享业务规则
// 新增、编辑、借阅入口统一使用，保证卡号唯一性判定、
// 有效期状态计算在各页面之间保持一致
// ========================================

// 本地日期（YYYY-MM-DD），避免 toISOString() 按 UTC 解析造成的时区偏移
export function formatDate(date) {
  const d = date instanceof Date ? date : new Date(date)
  if (Number.isNaN(d.getTime())) return ''
  const year = d.getFullYear()
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function todayStr() {
  return formatDate(new Date())
}

// 读者状态：有效期至当天仍为“正常”，次日起为“已过期”
// 边界日期 expireDate === 今天 => active
export function getReaderStatus(expireDate) {
  if (!expireDate) return 'expired'
  return expireDate >= todayStr() ? 'active' : 'expired'
}

export function isReaderActive(expireDate) {
  return getReaderStatus(expireDate) === 'active'
}

// 卡号唯一性校验：卡号被其他读者占用时返回 true
// excludeId 用于编辑场景排除读者自身
export function isCardNoDuplicate(cardNo, readers, excludeId = null) {
  const target = (cardNo || '').trim()
  return readers.some(reader =>
    reader.id !== excludeId && reader.cardNo === target
  )
}

// 借阅记录状态（动态计算，避免静态状态随时间失效）：
// 已归还 -> returned；未归还且应还日期 >= 今天 -> borrowed（应还当天仍可借阅）；
// 未归还且应还日期 < 今天 -> overdue
export function getBorrowStatus(record) {
  if (!record || record.status === 'returned' || record.returnDate) {
    return 'returned'
  }
  return record.dueDate >= todayStr() ? 'borrowed' : 'overdue'
}
